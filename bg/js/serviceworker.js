/* global Ankiconnect, Deinflector, Builtin, Agent, optionsLoad, optionsSave */
class QuickAnkiServiceworker {
    constructor() {

        this.options = null;

        this.ankiconnect = new Ankiconnect();
        //this.ankiweb = new Ankiweb();
        this.target = null;

        //setup lemmatizer
        this.deinflector = new Deinflector();
        this.deinflector.loadData();

        //Setup builtin dictionary data
        this.builtin = new Builtin();
        this.builtin.loadData();

        chrome.runtime.onMessage.addListener(this.onMessage.bind(this));
        chrome.runtime.onInstalled.addListener(this.onInstalled.bind(this));
        chrome.tabs.onCreated.addListener((tab) => this.onTabReady(tab.id));
        chrome.tabs.onUpdated.addListener(this.onTabReady.bind(this));
        chrome.commands.onCommand.addListener((command) => this.onCommand(command));
    }

    onCommand(command) {
        if (command != 'enabled') return;
        this.options.enabled = !this.options.enabled;
        this.setFrontendOptions(this.options);
        optionsSave(this.options);
    }

    onInstalled(details) {
        // Disabled for development: do not open onboarding/update tabs automatically.
    }

    onTabReady(tabId) {
        this.tabInvoke(tabId, {
            action:'setFrontendOptions', 
            params: { 
                options: this.options 
            }
        });
    }

    setFrontendOptions(options) {

        switch (options.enabled) {
            case false:
                chrome.action.setBadgeText({ text: 'off' });
                break;
            case true:
                chrome.action.setBadgeText({ text: '' });
                break;
        }
        this.tabInvokeAll({
            action:'setFrontendOptions',
            params: {
                options
            }
        });
    }

    checkLastError(){
        // NOP
    }

    tabInvokeAll(request) {
        chrome.tabs.query({}, (tabs) => {
            for (let tab of tabs) {
                this.tabInvoke(tab.id, request);
            }
        });
    }

    tabInvoke(tabId, request) {
        const callback = () => this.checkLastError(chrome.runtime.lastError);
        request.target = "frontend"
        chrome.tabs.sendMessage(tabId, request, callback);
    }

    formatNote(notedef) {
        let options = this.options;
        if (!options.deckname || !options.typename || !options.expression)
            return null;

        let note = {
            deckName: options.deckname,
            modelName: options.typename,
            options: { allowDuplicate: options.duplicate == '1' ? true : false },
            fields: {},
            tags: []
        };

        let fieldnames = ['expression', 'reading', 'extrainfo', 'definition', 'definitions', 'sentence', 'url'];
        for (const fieldname of fieldnames) {
            if (!options[fieldname]) continue;
            note.fields[options[fieldname]] = notedef[fieldname];
        }

        let tags = options.tags.trim();
        if (tags.length > 0) 
            note.tags = tags.split(' ');

        const audioFiles = (notedef.audios || []).filter(audio => typeof audio === 'string' && audio.trim().length > 0);
        if (options.audio && audioFiles.length > 0) {
            note.fields[options.audio] = '';
            let audionumber = Number(options.preferredaudio);
            audionumber = (audionumber && audioFiles[audionumber]) ? audionumber : 0;
            let audiofile = audioFiles[audionumber];
            note.audio = {
                'url': audiofile,
                'filename': `QA_${this.safeFilePart(options.dictSelected)}_${this.safeFilePart(notedef.expression)}_${audionumber}.mp3`,
                'fields': [options.audio]
            };
        }

        return note;
    }

    safeFilePart(value) {
        return String(value || 'audio').trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'audio';
    }

    // Message Hub and Handler start from here ...
    onMessage(request, sender, callback) {
        const { action, params, target} = request;

        if (target != 'serviceworker')
            return;

        const method = this['api_' + action];

        if (typeof(method) === 'function') {
            params.callback = callback;
            method.call(this, params);
        }
        return true;
    }

    async sendtoBackground(request){
        request.target='background';
        try {
            const result =  await chrome.runtime.sendMessage(request);
            return result;
        } catch (e) {
            return null
        }
    }

    // sandbox message handler
    async api_Fetch(params) {
        let { url, callback } = params;

        try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
    
        const text = await response.text();
        callback(text);
        } catch (e) {
        callback(null);
        }
    }

    async api_Deinflect(params) {
        let { word, callback } = params;
        callback(this.deinflector.deinflect(word));
    }

    async api_getBuiltin(params) {
        let { dict, word, callback } = params;
        callback(this.builtin.findTerm(dict, word));
    }

    async api_getLocale(params) {
        let { callback } = params;
        callback(chrome.i18n.getUILanguage());
    }

    // Frontend API
async api_getTranslation(params) {
        let { expression, callback } = params;

        if (expression.endsWith(".")) {
            expression = expression.slice(0, -1);
        }

        try {
            let dictionaryResult = await this.findTerm(expression);
            if (dictionaryResult && dictionaryResult.length > 0) {
                callback(await this.buildFromDictionary(expression, dictionaryResult));
            } else {
                callback(await this.buildQuickAnkiFallback(expression));
            }
        } catch (err) {
            callback(null);
        }
    }

    async api_getCardDraft(params) {
        let { expression, callback } = params;

        if (expression.endsWith(".")) {
            expression = expression.slice(0, -1);
        }

        try {
            const dictionaryResult = await this.findTerm(expression);
            if (dictionaryResult && dictionaryResult.length > 0) {
                callback(await this.buildFromDictionary(expression, dictionaryResult));
            } else {
                callback(await this.buildQuickAnkiFallback(expression));
            }
        } catch (err) {
            callback(null);
        }
    }

    async buildFromDictionary(expression, result) {
        if (!Array.isArray(result) || result.length === 0) return [];
        const translation = this.extractDictionaryTranslation(result) || expression;
        const [source, target, tatoebaSource, tatoebaTarget] = this.getTranslationLanguages();
        let examples = this.extractDictionaryExamples(result);
        if (!examples.length) examples = await this.getTatoebaExamples(expression, tatoebaSource, tatoebaTarget, 3);
        if (!examples.length) examples = await this.buildGeneratedExample(expression, translation, source, target);

        const firstNote = result[0] || {};
        const definitionsHtml = result
            .flatMap(note => Array.isArray(note.definitions) ? note.definitions : [])
            .filter(Boolean)
            .join('<hr>');
        const audios = result.flatMap(note => Array.isArray(note.audios) ? note.audios : []).filter(Boolean);

        return [{
            ...firstNote,
            quickanki: true,
            expression: firstNote.expression || expression,
            back: translation,
            examples: this.formatExamples(examples.slice(0, 5)),
            definitions: [definitionsHtml || translation],
            audios: audios.length ? audios : [this.buildTtsUrl(expression, source)]
        }];
    }

    getTranslationLanguages() {
        const dict = this.options ? this.options.dictSelected || '' : '';
        const routes = {
            dees: ['de', 'es', 'deu', 'spa'],
            dede: ['de', 'de', 'deu', 'deu'],
            enen: ['en', 'en', 'eng', 'eng'],
            enes: ['en', 'es', 'eng', 'spa'],
            esen: ['es', 'en', 'spa', 'eng'],
            fren: ['fr', 'en', 'fra', 'eng'],
            fres: ['fr', 'es', 'fra', 'spa'],
            iten: ['it', 'en', 'ita', 'eng'],
            kren: ['ko', 'en', 'kor', 'eng'],
            pten: ['pt', 'en', 'por', 'eng']
        };
        const prefix = dict.slice(0, 4).toLowerCase();
        return routes[prefix] || ['en', 'es', 'eng', 'spa'];
    }

async buildQuickAnkiFallback(expression, dictionaryResult = null) {
        const [source, target, tatoebaSource, tatoebaTarget] = this.getTranslationLanguages();
        const dictionaryExamples = this.extractDictionaryExamples(dictionaryResult);
        const [memoryTranslation, tatoebaExamples] = await Promise.all([
            this.translateWithMyMemory(expression, source, target),
            this.getTatoebaExamples(expression, tatoebaSource, tatoebaTarget, 5)
        ]);
        const translation = this.extractDictionaryTranslation(dictionaryResult) || memoryTranslation;
        if (!translation) return [];

        const allExamples = [...dictionaryExamples, ...tatoebaExamples.filter(e =>
            !dictionaryExamples.some(([s]) => s.toLowerCase() === e[0].toLowerCase())
        )];
        const examples = allExamples.length ? allExamples.slice(0, 5) : await this.buildGeneratedExample(expression, translation, source, target);
        const examplesHtml = this.formatExamples(examples);
        const definition = `<span class='tran'>${this.escapeHtml(translation)}</span>${examplesHtml}`;

        return [{
            css: this.quickAnkiCSS(),
            quickanki: true,
            expression,
            reading: this.extractDictionaryReading(dictionaryResult),
            extrainfo: 'QuickAnki',
            back: translation,
            examples: examplesHtml,
            definitions: [definition],
            audios: [this.buildTtsUrl(expression, source)]
        }];
    }

    extractDictionaryTranslation(result) {
        if (!Array.isArray(result) || result.length === 0) return '';

        for (const note of result) {
            const definitions = Array.isArray(note.definitions) ? note.definitions : [];
            for (const definition of definitions) {
                const text = this.extractTranslationText(definition);
                if (text) return text;
            }
        }
        return '';
    }

    extractDictionaryReading(result) {
        if (!Array.isArray(result) || result.length === 0) return '';
        const note = result.find(item => item && item.reading);
        return note ? note.reading : '';
    }

    extractDictionaryExamples(result) {
        if (!Array.isArray(result) || result.length === 0) return [];

        const pairs = [];
        for (const note of result) {
            const definitions = Array.isArray(note.definitions) ? note.definitions : [];
            for (const definition of definitions) {
                pairs.push(...this.extractExamplesFromHtml(definition));
            }
        }
        return this.cleanExamplePairs(pairs).slice(0, 2);
    }

extractExamplesFromHtml(html) {
        const source = String(html || '');
        const examples = [];

        const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(source)) !== null) {
            const item = liMatch[1];
            const eng = this.extractClassText(item, 'eng_sent') || this.extractClassText(item, 'eg_sent') || this.extractClassText(item, 'src_sent');
            const trans = this.extractClassText(item, 'chn_sent') || this.extractClassText(item, 'tgt_sent') || this.extractClassText(item, 'tran');
            if (eng && trans) examples.push([eng, trans]);
        }

        return examples;
    }

extractClassText(html, className) {
        const pattern = new RegExp(`<span[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`, 'i');
        const match = String(html || '').match(pattern);
        if (match) return this.htmlToText(match[1]);
        const anySpan = new RegExp(`<span[^>]*class=["'][^"']*${className.split('_')[0]}[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`, 'i');
        const anyMatch = String(html || '').match(anySpan);
        return anyMatch ? this.htmlToText(anyMatch[1]) : '';
    }

    extractTranslationText(html) {
        const source = String(html || '');
        const translationBlock = source.match(/<span[^>]+class=["'][^"']*(?:chn_tran|tran|eng_tran)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (translationBlock) {
            return this.htmlToText(translationBlock[1]);
        }

        return this.htmlToText(source)
            .replace(/^(noun|verb|adjective|adverb|phrase|phrasal verb)\s*(\[[^\]]+\])?\s*/i, '')
            .split(/\b[A-Z][a-z]+\s+\w+\s+/)[0]
            .trim();
    }

    htmlToText(html) {
        return String(html || '')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, ' ')
            .replace(/<\/li>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    buildTtsUrl(text, lang) {
        return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
            encodeURIComponent(lang || 'en') + '&q=' + encodeURIComponent(text);
    }

    async translateWithMyMemory(text, source, target) {
        const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
            '&langpair=' + encodeURIComponent(`${source}|${target}`);

        const response = await fetch(url);
        if (!response.ok) return '';

        const data = await response.json();
        if (data.responseStatus !== 200) return '';

        const translated = this.cleanTranslatedField(data.responseData && data.responseData.translatedText);
        return this.isUsableTranslation(text, translated) ? translated : '';
    }

    async buildGeneratedExample(expression, translation, source, target) {
        const sourceExample = this.generateSourceExample(expression);
        const translated = await this.translateWithMyMemory(sourceExample, source, target);
        return [[sourceExample, translated || translation]];
    }

    generateSourceExample(expression) {
        const text = String(expression || '').trim();
        const lower = text.charAt(0).toLowerCase() + text.slice(1);
        if (/^be\s+/i.test(text)) return `That is ${lower.replace(/^be\s+/i, '')}.`;
        if (/^go with the flow$/i.test(text)) return 'Sometimes it is better to go with the flow.';
        if (/^jump at the chance$/i.test(text)) return 'I would jump at the chance.';
        if (/^to\s+/i.test(text)) return `I want ${lower}.`;
        if (/\s/.test(text)) return `I try to ${lower}.`;
        return /^[aeiou]/i.test(text) ? `This is an ${lower}.` : `This is a ${lower}.`;
    }

async getTatoebaExamples(query, source, target, max = 5) {
        if (!source || !target || source === target) return [];

        const url = 'https://tatoeba.org/en/api_v0/search?from=' + encodeURIComponent(source) +
            '&to=' + encodeURIComponent(target) + '&query=' + encodeURIComponent(query) + '&sort=relevance';

        try {
            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            const pairs = (data.results || []).map(sentence => {
                const original = sentence.text || '';
                const translated = (sentence.translations || [])
                    .flat()
                    .find(item => item.lang === target && item.text);
                return [original, translated ? translated.text : ''];
            });

            return this.cleanExamplePairs(pairs).slice(0, max);
        } catch (err) {
            return [];
        }
    }

    cleanTranslatedField(value) {
        return String(value || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    isUsableTranslation(original, translated) {
        if (!translated) return false;
        if (translated.toLowerCase() === original.trim().toLowerCase()) return false;
        if (translated.length > Math.max(original.length, 20) * 4) return false;

        const lower = translated.toLowerCase();
        const junkMarkers = [
            'mymemory warning',
            'quota finished',
            'invalid language pair',
            'translated by',
            'translation memory',
            '<html',
            '</',
            '{"',
            'responsestatus'
        ];
        return !junkMarkers.some(marker => lower.includes(marker));
    }

cleanExamplePairs(examples) {
        const seen = new Set();
        return examples
            .map(([source, target]) => [this.cleanExampleText(source), this.cleanTranslatedField(target)])
            .filter(([source, target]) => this.isUsefulExample(source) && target && source.toLowerCase() !== target.toLowerCase())
            .filter(([source]) => {
                const key = source.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    cleanExampleText(value) {
        let text = String(value || '');
        text = text.replace(/\s+/g, ' ').trim();
        text = text.replace(/(?:\b[a-zA-Z]\b\s*){6,}/g, match => match.replace(/\s+/g, ''));
        text = text.replace(/([a-zA-Z])\s+(['’])\s+([a-zA-Z])/g, '$1$2$3');
        return text.replace(/\s+/g, ' ').trim();
    }

    isUsefulExample(example) {
        if (example.length < 12) return false;
        if (example.split(/\s+/).length < 3) return false;

        const genericPatterns = [
            /\bi found (the )?word\b/i,
            /\bfound the word\b/i,
            /\btry to use\b/i,
            /\bin your own sentence\b/i,
            /\bin an english text\b/i,
            /\bexample sentence\b/i,
            /\buse .{0,80} in (a|your) sentence\b/i
        ];
        return !genericPatterns.some(pattern => pattern.test(example));
    }

    formatExamples(examples) {
        return examples.map(([source, target]) =>
            '<ul class="sents qa-example"><li class="sent">' +
            `<span class="eng_sent">${this.escapeHtml(source)}</span>` +
            `<span class="chn_sent"><br>${this.escapeHtml(target)}</span>` +
            '</li></ul>'
        ).join('');
    }

    quickAnkiCSS() {
        return `<style>
            .qa-meaning {font-size:1.12em;font-weight:800;margin:0 0 20px;line-height:1.35;}
            .qa-meaning .chn_tran {color:#90caf9;}
            .qa-examples-wrap {margin-top:12px;}
            ul.sents, ul.qa-example {font-size:.96em;list-style:square inside;margin:12px 0;padding:12px;background:rgba(144,202,249,.12);border-radius:7px;}
            li.sent {margin:0;padding:0;}
            span.eng_sent {display:block;color:inherit;font-weight:650;margin-bottom:5px;}
            span.chn_sent {display:block;color:#90caf9;}
        </style>`;
    }

    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    async api_addNote(params) {
        let { notedef, callback } = params;

        try {
            let result = notedef.quickanki ? await this.addQuickAnkiNote(notedef) : await this.target.addNote(this.formatNote(notedef));
            callback(result);
        } catch (err) {
            console.error(err);
            callback(null);
        }
    }

    async addQuickAnkiNote(notedef) {
        if (!this.target || this.target !== this.ankiconnect) return null;

        const deckName = (this.options && this.options.deckname) || 'random words 1';
        const modelName = (this.options && this.options.typename) || 'QuickAnki';

        await this.ensureDeck(deckName);

        const soundField = await this.storeQuickAnkiAudio(notedef.expression, notedef.audios && notedef.audios[0]);
        const tags = ((this.options && this.options.tags) || 'QuickAnki').trim().split(/\s+/).filter(Boolean);
        const fields = {};
        fields[(this.options && this.options.expression) || 'Front'] = this.escapeHtml(notedef.expression || '');
        fields[(this.options && this.options.definition) || 'Back'] = this.composeCardBack(notedef);
        fields[(this.options && this.options.sentence) || 'Note'] = notedef.sentence || '';
        fields[(this.options && this.options.audio) || 'Sound'] = soundField;
        fields[(this.options && this.options.reading) || 'Reading'] = notedef.reading || '';

        const note = {
            deckName,
            modelName,
            options: { allowDuplicate: this.options && this.options.duplicate == '1' ? true : false },
            fields,
            tags
        };

        return await this.ankiconnect.addNote(note);
    }

    composeCardBack(notedef) {
        const back = this.escapeHtml(notedef.back || this.htmlToText(notedef.definition || ''));
        const examples = notedef.examples || '';
        return `${this.quickAnkiCSS()}<div class="qa-meaning"><span class="tran"><span class="chn_tran">${back}</span></span></div><div class="qa-examples-wrap">${examples}</div>`;
    }

    async ensureDeck(deckName) {
        const names = await this.ankiconnect.getDeckNames() || [];
        if (!names.includes(deckName)) {
            await this.ankiconnect.ankiInvoke('createDeck', { deck: deckName });
        }
    }

    async ensureQuickAnkiModel(modelName) {
        const names = await this.ankiconnect.getModelNames() || [];
        if (names.includes(modelName)) {
            await this.updateQuickAnkiModel(modelName);
            return;
        }

        await this.ankiconnect.ankiInvoke('createModel', {
            modelName,
            inOrderFields: ['Front', 'Back', 'Examples', 'Sound'],
            css: this.quickAnkiCardCSS(),
            cardTemplates: [{
                Name: 'Card 1',
                Front: '<div class="qa-front">{{Front}}</div><div class="qa-sound">{{Sound}}</div>',
                Back: '{{FrontSide}}<hr id="answer"><section class="qa-back"><div class="qa-label">Meaning</div><div class="qa-translation">{{Back}}</div></section><section class="qa-examples"><div class="qa-label">Examples</div>{{Examples}}</section>'
            }]
        });
    }

    async updateQuickAnkiModel(modelName) {
        await this.ankiconnect.ankiInvoke('updateModelTemplates', {
            model: {
                name: modelName,
                templates: {
                    'Card 1': {
                        Front: '<div class="qa-front">{{Front}}</div><div class="qa-sound">{{Sound}}</div>',
                        Back: '{{FrontSide}}<hr id="answer"><section class="qa-back"><div class="qa-label">Meaning</div><div class="qa-translation">{{Back}}</div></section><section class="qa-examples"><div class="qa-label">Examples</div>{{Examples}}</section>'
                    }
                }
            }
        });

        await this.ankiconnect.ankiInvoke('updateModelStyling', {
            model: {
                name: modelName,
                css: this.quickAnkiCardCSS()
            }
        });
    }

    async storeQuickAnkiAudio(front, audioUrl) {
        if (!audioUrl) return '';

        try {
            const response = await fetch(audioUrl);
            if (!response.ok) return '';

            const buffer = await response.arrayBuffer();
            if (!buffer.byteLength) return '';

            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            }

            const filename = `quickanki_${this.safeFilePart(front)}_${Math.abs(this.hashString(audioUrl))}.mp3`;
            const stored = await this.ankiconnect.ankiInvoke('storeMediaFile', {
                filename,
                data: btoa(binary)
            }, 12000);

            return stored ? `[sound:${stored}]` : '';
        } catch (err) {
            console.error('QuickAnki audio save failed:', err);
            return '';
        }
    }

    hashString(value) {
        let hash = 0;
        for (let i = 0; i < String(value).length; i++) {
            hash = ((hash << 5) - hash) + String(value).charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    quickAnkiCardCSS() {
        return `
            .card { background:#242424; color:#f5f7fb; font-family:Arial, Helvetica, sans-serif; font-size:21px; line-height:1.42; text-align:left; padding:22px; }
            .qa-front { font-size:1.55em; font-weight:800; text-align:center; margin:6px 0 10px; letter-spacing:.01em; }
            .qa-sound { text-align:center; margin:0 0 18px; }
            #answer { border:0; border-top:1px solid rgba(255,255,255,.35); margin:18px 0; }
            .qa-label { color:#9aa0a6; font-size:.62em; font-weight:700; letter-spacing:.12em; margin:0 0 6px; text-transform:uppercase; }
            .qa-back { margin:0 0 18px; }
            .qa-translation { color:#8ecbff; font-size:1.18em; font-weight:800; }
            .qa-examples { margin-top:12px; }
            ul.sents { list-style:square inside; margin:8px 0; padding:12px; background:#343d42; border-radius:7px; }
            li.sent { margin:0; padding:0; }
            span.eng_sent { color:#f5f7fb; font-weight:650; }
            span.chn_sent { color:#8ecbff; display:block; margin-top:3px; }
        `;
    }

    async api_playAudio(params) {
        let { url, callback } = params;

        try {
            let result = await this.playAudio(url);
            callback(result);
        } catch (err) {
            callback(null);
        }
    }

    // Option page and Brower Action page requests handlers.
    async optionsChanged(options) {
        this.setFrontendOptions(options);

        switch (options.services) {
            case 'none':
                this.target = null;
                break;
            case 'ankiconnect':
                this.target = this.ankiconnect;
                break;
            //case 'ankiweb':
            //    this.target = this.ankiweb;
            //    break;
            default:
                this.target = null;
        }

        let defaultscripts = ['builtin_select'];
        let newscripts = `${options.sysscripts},${options.udfscripts}`;
        let loadresults = null;
        if (!this.options || (`${this.options.sysscripts},${this.options.udfscripts}` != newscripts)) {
            const scriptsset = Array.from(new Set(defaultscripts.concat(newscripts.split(',').filter(x => x).map(x => x.trim()))));
            loadresults = await this.loadScripts(scriptsset);
        }

        this.options = options;
        if (loadresults) {
            let namelist = loadresults.map(x => x.result.objectname);
            this.options.dictSelected = namelist.includes(options.dictSelected) ? options.dictSelected : namelist[0];
            this.options.dictNamelist = loadresults.map(x => x.result);
        }
        await this.setScriptsOptions(this.options);
        optionsSave(this.options);
    }

    // Option pages API
    async api_initBackend(params) {
        let options = await optionsLoad();
        //this.ankiweb.initConnection(options);
        await this.optionsChanged(options);
    }

    async api_optionsChanged(params) {
        let { options, callback } = params;
        await this.optionsChanged(options);
        callback(this.options);
    }

    async api_getDeckNames(params) {
        let { callback } = params;
        callback(this.target ? await this.target.getDeckNames() : null);
    }

    async api_getModelNames(params) {
        let { callback } = params;
        callback(this.target ? await this.target.getModelNames() : null);
    }

    async api_getModelFieldNames(params) {
        let { modelName, callback } = params;
        callback(this.target ? await this.target.getModelFieldNames(modelName) : null);
    }

    async api_getVersion(params) {
        let { callback } = params;
        callback(this.target ? await this.target.getVersion() : null);
    }

    // Sandbox API
    async loadScripts(list) {
        let promises = list.map((name) => this.loadScript(name));
        let results = await Promise.all(promises);
        return results.filter(x => { if (x.result) return x.result; });
    }

    async loadScript(name) {
        return await this.sendtoBackground({action:'loadScript', params:{name}});
    }

    async setScriptsOptions(options) {
        return await this.sendtoBackground({action:'setScriptsOptions', params:{options}});
    }

    async findTerm(expression) {
        return await this.sendtoBackground({action:'findTerm', params:{expression}});
    }

    async playAudio(url) {
        return await this.sendtoBackground({action:'playAudio', params:{url}});
    }
}

importScripts('ankiconnect.js');
importScripts('builtin.js');
importScripts('deinflector.js');
importScripts('utils.js');
importScripts('agent.js');

setupOffscreenDocument('/bg/background.html');
qaServiceworker = new QuickAnkiServiceworker();

// according to woxxom's reply on below stackoverflow discussion
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();
