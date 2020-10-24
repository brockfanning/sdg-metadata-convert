const path = require('path')
const fsp = require('fs').promises;
const conceptStore = require('../lib/store/concept-store')
const nunjucks = require('nunjucks')
const jsDiff = require('diff')
const Diff2html = require('diff2html')
const HtmlDiff = require('htmldiff-js').default
const convertHTMLToPDF = require('pdf-puppeteer')

class Diff {

    constructor(oldMeta, newMeta) {
        this.diffs = []
        const conceptsDiffed = []
        for (const conceptId of Object.keys(oldMeta.getConcepts())) {
            conceptsDiffed.push(conceptId)
            const before = oldMeta.getConcept(conceptId)
            const after = newMeta.getConcept(conceptId)
            if (before != after) {
                this.diffs.push({
                    before: before || '',
                    after: after || '',
                    name: conceptStore.getConceptNameById(conceptId) + ' (' + conceptId + ')',
                })
            }
        }
        // Make sure there are not any more from the "after" version.
        for (const conceptId of Object.keys(newMeta.getConcepts())) {
            if (conceptsDiffed.includes(conceptId) === false) {
                const before = oldMeta.getConcept(conceptId)
                const after = newMeta.getConcept(conceptId)
                if (before != after) {
                    this.diffs.push({
                        before: before || '',
                        after: after || '',
                        name: conceptStore.getConceptNameById(conceptId) + ' (' + conceptId + ')',
                    })
                }
            }
        }

        const beforeDate = this.stripHtmlTags(oldMeta.getConcept('META_LAST_UPDATE'))
        const afterDate = this.stripHtmlTags(newMeta.getConcept('META_LAST_UPDATE'))
        const beforeTitle = this.stripHtmlTags(oldMeta.getConcept('SDG_INDICATOR'))
        const afterTitle = this.stripHtmlTags(newMeta.getConcept('SDG_INDICATOR'))

        this.title = (beforeTitle == afterTitle) ? beforeTitle : beforeTitle + ' -> ' + afterTitle
        this.beforeDate = beforeDate
        this.afterDate = afterDate
    }

    stripHtmlTags(originalString) {
        if (!originalString) {
            return '';
        }
        return originalString.replace(/(<([^>]+)>)/gi, "")
    }

    getSourceDiffs() {
        return this.diffs.map(diff => {
            const delta = jsDiff.createTwoFilesPatch(diff.name, diff.name, diff.before, diff.after)
            const parsed = Diff2html.parse(delta)
            return Diff2html.html(parsed, {
                drawFileList: false,
                outputFormat: 'side-by-side',
            })
        })
    }

    getRenderedDiffs() {
        return this.diffs.map(diff => {
            const heading = '<div class="d2h-file-header"><div class="d2h-file-name-wrapper"><div class="d2h-file-name">' + diff.name + '</div></div></div>'
            return heading + HtmlDiff.execute(diff.before, diff.after)
        })
    }

    getHtml(diffs) {
        const wrappedHtmlSections = diffs.map(section => {
            return '<div class="sdg-diff-section">' + section + '</div>'
        })

        const layoutFolder = path.join(__dirname, 'layout')
        const nunjucksOptions = { autoescape: false }
        const layoutData = {
            title: this.title,
            beforeDate: this.beforeDate,
            afterDate: this.afterDate,
            htmlDiff: wrappedHtmlSections.join(''),
        }
        nunjucks.configure(layoutFolder, nunjucksOptions)
        return nunjucks.render('diff.njk', layoutData)
    }

    getSourceHtml() {
        const diffs = this.getSourceDiffs()
        return this.getHtml(diffs)
    }

    getRenderedHtml() {
        const diffs = this.getRenderedDiffs()
        return this.getHtml(diffs)
    }

    writeSourceHtml(fileName) {
        return this.writeHtml(this.getSourceHtml(), fileName)
    }

    writeRenderedHtml(fileName) {
        return this.writeHtml(this.getRenderedHtml(), fileName)
    }

    writeHtml(html, fileName) {
        return this.writeFile(fileName, html)
    }

    writeSourcePdf(fileName, pdfOptions, launchOptions) {
        return this.writePdf(this.getSourceHtml(), fileName, pdfOptions, launchOptions)
    }

    writeRenderedPdf(fileName, pdfOptions, launchOptions) {
        return this.writePdf(this.getRenderedHtml(), fileName, pdfOptions, launchOptions)
    }

    writePdf(html, fileName, pdfOptions, launchOptions) {
        pdfOptions = pdfOptions || {
            printBackground: true,
            format: 'A4',
            margin: {
                top: '60px',
                right: '60px',
                bottom: '60px',
                left: '60px',
            },
        }
        launchOptions = launchOptions || {}
        const callback = pdf => this.writeFile(fileName, pdf)
        return this.convertHtmlToPdfPromise(html, callback, pdfOptions, launchOptions)
    }

    // Promisify the convertHTMLtoPDF function.
    convertHtmlToPdfPromise(html, callback, pdfOptions, launchOptions) {
        return new Promise((resolve, reject) => {
            console.log('launch options during diff PDF write:')
            console.log(launchOptions)
            convertHTMLToPDF(html, pdf => {
                if (!pdf) reject(new Error('Unable to convert HTML to PDF.'))
                else resolve(callback(pdf))
            }, pdfOptions, launchOptions)
        })
    }

    writeFile(outputFile, fileData) {
        return fsp.writeFile(outputFile, fileData).then(() => {
            return this
        }).catch(err => {
            console.error(err);
        });
    }
}

module.exports = Diff
