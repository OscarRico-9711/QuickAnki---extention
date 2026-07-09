/* global api */
class dees_Larousse {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('EN') != -1) return 'German -> Spanish | Larousse';
        return 'Alemán -> Español | Larousse';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        //let deflection = api.deinflect(word);
        let results = await Promise.all([this.findLarousse(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findLarousse(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        let base = 'https://www.larousse.com/es/dictionaries/german-spanish/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        let dictionary = doc.querySelector('.article_bilingue');
        if (!dictionary) return notes; // return empty notes

        let expression = T(dictionary.querySelector('.Adresse'));
        let reading = T(dictionary.querySelector('.Phonetique'));

        let band = dictionary.querySelector('.word-frequency-img');
        let bandnum = band ? band.dataset.band : '';
        let extrainfo = bandnum ? `<span class="band">${'\u25CF'.repeat(Number(bandnum))}</span>` : '';

        let sound = dictionary.querySelector('audio:first-of-type');
        let audios = sound ? [`https://www.larousse.com${sound.getAttribute('src')}`] : [];
        // make definition segement
        let definitions = [];
        let defblocks = dictionary.querySelectorAll('.Traduction') || [];
        for (const defblock of defblocks) {
            let pos = T(defblock.querySelector('.pos'));
            pos = pos ? `<span class="pos">${pos}</span>` : '';
            let esp_tran = T(defblock.querySelector('.lienarticle2'));
            if (!esp_tran) continue;
            let definition = '';
            esp_tran = esp_tran.replace(RegExp(expression, 'gi'), '<b>$&</b>');
            esp_tran = `<span class='esp_tran'>${esp_tran}</span>`;
            let tran = `<span class='tran'>${esp_tran}</span>`;
            definition += `${tran}`;

            // make exmaple segement
            let examps = dictionary.querySelectorAll('.Locution2') || '';
            let examps1 = dictionary.querySelectorAll('.Traduction2') || '';
            if (examps.length > 0 && this.maxexample > 0) {
                definition += '<ul class="sents">';
                for (const [index, examp] of examps.entries()) {
                    if (index > this.maxexample - 1) break; // to control only 2 example sentence.
                    let eng_examp = T(examp) ? T(examp).replace(RegExp(expression, 'gi'), '<b>$&</b>') : '';
                    let esp_examp = T(examps1[index]) ? T(examps1[index]).replace(RegExp(expression, 'gi'), '<b>$&</b>') : '';
                    let examp_concat = eng_examp + ' - ' + '<span style="color:blue;">' + esp_examp + '</span>';
                    definition += examp_concat ? `<li class='sent'><span class='eng_sent'>${examp_concat}</span></li>` : '';
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
            extrainfo,
            definitions,
            audios,
        });
        return notes;
    }

    renderCSS() {
        let css = `
            <style>
                span.band {color:#e52920;}
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.esp_tran {margin-right:3px; padding:0;}
                span.chn_tran {color:#0d47a1;}
                ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.chn_sent {color:#0d47a1;}
            </style>`;
        return css;
    }
}