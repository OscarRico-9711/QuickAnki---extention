/* global api */
class kren_Collins {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('EN') != -1) return 'Korean -> English | Collins';
        return 'Coreano -> Inglés | Collins';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        //let deflection = api.deinflect(word);
        let results = await Promise.all([this.findCollins(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findCollins(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        let base = 'https://www.collinsdictionary.com/dictionary/korean-english/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        let dictionary = doc.querySelector('.cB.cB-def.dictionary');
        if (!dictionary) return notes; // return empty notes

        let expression = T(dictionary.querySelector('.h2_entry'));
        let reading = T(dictionary.querySelector('.pron'));

        let band = dictionary.querySelector('.word-frequency-img');
        let bandnum = band ? band.dataset.band : '';
        let extrainfo = bandnum ? `<span class="band">${'\u25CF'.repeat(Number(bandnum))}</span>` : '';

        let sound = dictionary.querySelector('a.hwd_soundw');
        let audios = sound ? [sound.dataset.srcMp3] : [];
        // make definition segement
        let definitions = [];
        let defblocks = dictionary.querySelectorAll('.content.definitions.dictionary') || [];
        for (const defblock of defblocks) {
            let pos = T(defblock.querySelector('.pos'));
            pos = pos ? `<span class="pos">${pos}</span>` : '';
            let spanElement = defblock.querySelector('.sense .xr');
            let texto = spanElement.firstChild.textContent.trim();
            let eng_tran = texto;
            if (!eng_tran) continue;
            let definition = '';
            eng_tran = eng_tran.replace(RegExp(expression, 'gi'), '<b>$&</b>');
            eng_tran = `<span class='eng_tran'>${eng_tran}</span>`;
            let tran = `<span class='tran'>${eng_tran}</span>`;
            definition += `${tran}`;

            // make example segment
            let examps = defblock.querySelectorAll('.sense .cit.type-example .quote') || '';
            let examps1 = defblock.querySelectorAll('.sense .cit.type-translation .quote') || '';
            if (examps.length > 0 && examps1.length > 0 && this.maxexample > 0) {
            definition += '<ul class="sents">';
            let eng_examp = T(examps[0]) ? T(examps[0]).replace(RegExp(expression, 'gi'), '<b>$&</b>') : '';
            let esp_examp = T(examps1[0]) ? T(examps1[0]).replace(RegExp(expression, 'gi'), '<b>$&</b>') : '';

            definition += '<li class="sent">';
            definition += '<span class="eng_sent">' + eng_examp + ' - ' + '<span style="color:blue;">' + esp_examp + '</span></span></li>';

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