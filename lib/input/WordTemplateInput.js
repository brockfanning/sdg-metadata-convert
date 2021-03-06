const BaseInput = require('./BaseInput')
const mammoth = require('mammoth')
const cheerio = require('cheerio')
const pretty = require('pretty')
const conceptStore = require('../concept-store')

class WordTemplateInput extends BaseInput {

    read(source) {
        const mammothOptions = this.getMammothOptions()
        return mammoth.convertToHtml({ path: source }, mammothOptions).then(result => {
            if (this.options.debug) {
                console.log(result.messages)
            }
            const metadata = {}
            const html = result.value
            const $ = cheerio.load(html)

            this.cleanHtml($)

            $('body > table').each((idx, table) => {
                const section = $(table).find('> tbody > tr > td > h1').first().text()
                if (section) {
                    const concepts = this.parseConcepts(table, $)
                    for (const [conceptName, conceptValue] of Object.entries(concepts)) {
                        const conceptId = conceptStore.getConceptIdByName(conceptName)
                        metadata[conceptId] = conceptValue
                    }
                }
            })
            return metadata
        })
    }

    cleanHtml($) {
        // Remove a lot of table-of-contents anchors that Word tends to add.
        $('a[id^=_]').remove()
    }

    getMammothOptions() {
        return {
            styleMap: [
                "p[style-name='M.Header'] => h1:fresh",
                "p[style-name='M.Sub.Header'] => h2:fresh",
            ]
        }
    }

    parseConcepts(table, $) {
        const concepts = {}
        $(table).find('> tbody > tr').slice(2).each((idx, conceptRow) => {
            const conceptNameCell = $(conceptRow).find('> td:first-child')
            const conceptName = $(conceptNameCell)
                // Remove the footnotes that the names have.
                .clone().find('sup').remove().end()
                // And get the plain text that is left.
                .text().trim()
            const conceptValueCell = $(conceptRow).find('> td:nth-child(2)')
            const footnotes = this.parseFootnotes(conceptValueCell, $)

            // Confirm that this is actual content.
            if (this.isConceptValueValid(conceptValueCell, $)) {
                let conceptValue = this.prepareOutput(conceptValueCell, $)
                if (footnotes.length > 0) {
                    conceptValue += this.wrapFootnotes(footnotes)
                }
                concepts[conceptName] = conceptValue
            }
        })
        return concepts
    }

    parseFootnotes(concept, $) {
        const anchors = $(concept).find('a').filter((idx, a) => this.isFootnote(a, $))
        // Find the corresponding footnotes.
        const footnotes = $(anchors).map((idx, a) => $($(a).attr('href')))
        const footnoteNumbers = $(anchors).map((idx, a) => {
            return Number.parseInt($(a).text().replace('[', '').replace(']', ''))
        })
        // Return the footnotes as HTML.
        return $(footnotes).map((idx, footnote) => {
            const number = footnoteNumbers[idx]
            return '<div><sup>' + number + '</sup>' + $(footnote).html() + '</div>'
        }).get()
    }

    isFootnote(link, $) {
        const href = $(link).attr('href')
        const startsWithHash = href && href.startsWith('#')
        const parentIsSup = link.parent && link.parent.tagName === 'sup'
        return startsWithHash && parentIsSup
    }

    wrapFootnotes(footnotes) {
        return '<div class="footnotes">' + footnotes.join('') + '</div>'
    }

    isConceptValueValid(input, $) {
        // Microsoft Word can put in some weird stuff. This is a sanity check that
        // we actually have real content.
        const text = $(input).text().replace(/[^\w]/gi, '').trim()
        return text.length > 0
    }

    prepareOutput(input, $) {
        const html = $(input).html()
        return pretty(html.trim())
    }

}

module.exports = WordTemplateInput
