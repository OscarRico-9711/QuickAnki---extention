/* global api */
class dede_DWDS {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('EN') != -1) return 'German -> German | DWDS';
        return 'Alemán -> Alemán | DWDS';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        //let deflection = api.deinflect(word);
        let results = await Promise.all([this.findDWDS(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findDWDS(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        let base = 'https://www.dwds.de/wb/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        let dictionary = doc.querySelector('.article-leftcol');
        if (!dictionary) return notes; // return empty notes

        let expression = T(dictionary.querySelector('.dwdswb-ft-lemmaansatz'));
        let reading = T(dictionary.querySelector('.hyphenation'));

        let audioSource = dictionary.querySelector('source');
        let sound = audioSource.getAttribute('src');
        let audios = sound ? [sound] : [];
        // make definition segement
        let definitions = [];
        let defblocks = dictionary.querySelectorAll('.dwdswb-lesarten') || [];
        for (const defblock of defblocks) {
            let eng_tran = T(defblock.querySelector('.dwdswb-lesart-content .dwdswb-definition'));
            if (!eng_tran) continue;
            let definition = '';
            eng_tran = eng_tran.replace(RegExp(expression, 'gi'), '<b>$&</b>');
            eng_tran = `<span class='eng_tran'>${eng_tran}</span>`;
            let tran = `<span class='tran'>${eng_tran}</span>`;
            definition += `${tran}`;

            // make exmaple segement
            let examps = defblock.querySelectorAll('.dwdswb-lesart-content .dwdswb-kompetenzbeispiel') || '';
            if (examps.length > 0 && this.maxexample > 0) {
                definition += '<ul class="sents">';
                for (const [index, examp] of examps.entries()) {
                    if (index > this.maxexample - 1) break; // to control only 2 example sentence.
                    let eng_examp = T(examp) ? T(examp).replace(RegExp(expression, 'gi'), '<b>$&</b>') : '';
                    definition += eng_examp ? `<li class='sent'><span class='eng_sent'>${eng_examp}</span></li>` : '';
                }
                definition += '</ul>';
            }
            definition && definitions.push(definition);
        }
        let css = this.renderCSS();
        notes.push({
            css,
            expression,
            reading,
            definitions,
            audios,
        });
        return notes;
    }

    renderCSS() {
        let css = `
            <style>
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0;}
                span.chn_tran {color:#0d47a1;}
                ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.chn_sent {color:#0d47a1;}
            </style>`;
        return css;
    }
}