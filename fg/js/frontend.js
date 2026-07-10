/* global Popup, rangeFromPoint, TextSourceRange, selectedText, isEmpty, getSentence, isConnected, addNote, getTranslation, playAudio, isValidElement*/
class QuickAnkiFrontend {

    constructor() {
        this.options = null;
        this.point = null;
        this.notes = null;
        this.sentence = null;
        this.audio = {};
        this.enabled = true;
        this.mouseselection = true;
        this.activateHotkey = '16'; // 0:off, 16:shift, 17:ctrl, 18:alt, or custom text like | / A / Ctrl+K
        this.exitKey = 27; // esc 27
        this.maxContext = 1; //max context sentence #
        this.services = 'none';
        this.popup = new Popup();
        this.actionBar = null;
        this.timeout = null;
        this.mousemoved = false;

        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('mousedown', e => this.onMouseDown(e));
        window.addEventListener('dblclick', e => this.onDoubleClick(e));
        window.addEventListener('keydown', e => this.onKeyDown(e));

        chrome.runtime.onMessage.addListener(this.onMessage.bind(this));
        window.addEventListener('message', e => this.onFrameMessage(e));
        document.addEventListener('selectionchange', e => this.userSelectionChanged(e));
        //window.addEventListener('selectionend', e => this.onSelectionEnd(e));
    }

    onKeyDown(e) {
        if (!this.activateHotkey || this.activateHotkey === '0')
            return;

        if (!isValidElement())
            return;

        if (this.enabled && this.isActivationHotkey(e)) {
            if (!isEmpty(selectedText())) {
                this.mousemoved = false;
                this.openCardComposer(e);
                return;
            }

            if (this.point === null) return;
            const range = rangeFromPoint(this.point);
            if (range == null) return;
            let textSource = new TextSourceRange(range);
            textSource.selectText();
            this.mousemoved = false;
            this.onSelectionEnd(e);
        }

        if (e.keyCode === this.exitKey || e.charCode === this.exitKey)
            this.popup.hide();
    }

    isActivationHotkey(e) {
        const hotkey = String(this.activateHotkey || '').trim();
        if (!hotkey || hotkey === '0') return false;

        const keyCode = Number(hotkey);
        if (!Number.isNaN(keyCode)) {
            return e.keyCode === keyCode || e.charCode === keyCode;
        }

        const parts = hotkey.split('+').map(part => part.trim()).filter(Boolean);
        if (parts.length === 0) return false;

        if (parts.length === 1) {
            return this.normalizedEventKey(e) === this.normalizeHotkeyPart(parts[0]);
        }

        const key = this.normalizeHotkeyPart(parts[parts.length - 1]);
        const modifiers = new Set(parts.slice(0, -1).map(part => this.normalizeHotkeyPart(part)));
        if (e.ctrlKey !== modifiers.has('control')) return false;
        if (e.shiftKey !== modifiers.has('shift')) return false;
        if (e.altKey !== modifiers.has('alt')) return false;
        if (e.metaKey !== modifiers.has('meta')) return false;
        return this.normalizedEventKey(e) === key;
    }

    normalizedEventKey(e) {
        const legacy = {
            16: 'shift',
            17: 'control',
            18: 'alt',
            27: 'escape',
            32: 'space',
            37: 'left',
            38: 'up',
            39: 'right',
            40: 'down',
        };
        return this.normalizeHotkeyPart(e.key || legacy[e.keyCode] || String.fromCharCode(e.keyCode || e.charCode || 0));
    }

    normalizeHotkeyPart(value) {
        const key = String(value || '').toLowerCase();
        const aliases = {
            ctrl: 'control',
            ctl: 'control',
            control: 'control',
            cmd: 'meta',
            command: 'meta',
            win: 'meta',
            windows: 'meta',
            option: 'alt',
            esc: 'escape',
            escape: 'escape',
            spacebar: 'space',
            ' ': 'space',
            arrowleft: 'left',
            arrowright: 'right',
            arrowup: 'up',
            arrowdown: 'down',
        };
        return aliases[key] || key;
    }

    onDoubleClick(e) {
        if (!this.mouseselection)
            return;

        if (!isValidElement())
            return;

        if (this.timeout)
            clearTimeout(this.timeout);
        this.mousemoved = false;
        this.showSelectionActions();
    }

    onMouseDown(e) {
        if (e.target && e.target.closest && e.target.closest('#qa-selection-actions')) return;
        this.popup.hide();
        this.hideSelectionActions();
    }

    onMouseMove(e) {
        this.mousemoved = true;
        this.point = {
            x: e.clientX,
            y: e.clientY,
        };
    }

    userSelectionChanged(e) {

        if (!this.enabled || !this.mousemoved || !this.mouseselection) return;

        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        // wait 500 ms after the last selection change event
        this.timeout = setTimeout(() => {
            this.showSelectionActions();
            //var selEndEvent = new CustomEvent('selectionend');
            //window.dispatchEvent(selEndEvent);
        }, 500);
    }

    showSelectionActions() {
        const expression = selectedText();
        if (isEmpty(expression)) return;

        const rect = this.getSelectionRect();
        if (!rect) return;

        if (!this.actionBar) {
            this.actionBar = document.createElement('div');
            this.actionBar.id = 'qa-selection-actions';
            this.actionBar.innerHTML = `
                <button class="qa-action-card" title="Crear card">+ Card</button>
            `;
            this.actionBar.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();
            });
            this.actionBar.querySelector('.qa-action-card').addEventListener('click', e => {
                e.preventDefault();
                this.hideSelectionActions();
                this.openCardComposer(e);
            });
            document.body.appendChild(this.actionBar);
        }

        const width = 74;
        let left = rect.left;
        let top = rect.bottom + 8;
        if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
        if (left < 10) left = 10;
        if (top + 38 > window.innerHeight - 10) top = Math.max(10, rect.top - 46);

        this.actionBar.style.left = `${Math.round(left)}px`;
        this.actionBar.style.top = `${Math.round(top)}px`;
        this.actionBar.style.display = 'flex';
    }

    hideSelectionActions() {
        if (this.actionBar) this.actionBar.style.display = 'none';
    }

    getSelectionRect() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount < 1) return null;
        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        return rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    }

    speakSelection() {
        const text = selectedText();
        if (!text || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.detectSpeechLang(text);
        utterance.rate = 0.92;
        window.speechSynthesis.speak(utterance);
    }

    detectSpeechLang(text) {
        if (/[ñáéíóúü¿¡]|\b(que|con|para|una|por|como|pero|ella|esto|tiene|sobre|aquí|allí)\b/i.test(text)) return 'es-ES';
        return 'en-US';
    }

    async openCardComposer(e) {
        if (!this.enabled || !isValidElement()) return;

        this.timeout = null;
        const expression = selectedText();
        if (isEmpty(expression)) return;

        let result = await frontendApi.getCardDraft(expression);
        if (result == null || result.length == 0) return;
        this.notes = this.buildNote(result);
        const point = this.point || this.getSelectionPoint();
        this.popup.showNextTo({ x: point.x, y: point.y }, await this.renderPopup(this.notes));
    }

    async onSelectionEnd(e) {

        if (!this.enabled)
            return;

        if (!isValidElement())
            return;

        // reset selection timeout
        this.timeout = null;
        const expression = selectedText();
        if (isEmpty(expression)) return;

        let result = await frontendApi.getTranslation(expression);
        if (result == null || result.length == 0) return;
        this.notes = this.buildNote(result);
        const point = this.point || this.getSelectionPoint();
        this.popup.showNextTo({ x: point.x, y: point.y, }, await this.renderPopup(this.notes));

    }

    getSelectionPoint() {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            if (rect && (rect.left || rect.top)) {
                return { x: rect.left, y: rect.bottom };
            }
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    onMessage(request, sender, callback) {
        const { action, params, target } = request;
        if (target !='frontend')
            return;

        const method = this['api_' + action];

        if (typeof(method) === 'function') {
            params.callback = callback;
            method.call(this, params);
        }

        callback();
    }

    api_setFrontendOptions(params) {
        let { options, callback } = params;
        this.options = options;
        this.enabled = options.enabled;
        this.mouseselection = options.mouseselection;
        this.activateHotkey = String(this.options.hotkey || '0');
        this.maxContext = Number(this.options.maxcontext);
        this.services = options.services;
        callback();
    }

    onFrameMessage(e) {
        const { action, params } = e.data;
        const method = this['api_' + action];
        if (typeof(method) === 'function') {
            method.call(this, params);
        }
    }

    async api_addNote(params) {
        let { nindex, dindex, context, quickanki } = params;

        let notedef = Object.assign({}, this.notes[nindex]);
        if (quickanki) {
            notedef.expression = quickanki.front;
            notedef.back = quickanki.back;
            notedef.examples = quickanki.examples;
            notedef.definition = quickanki.back;
            notedef.definitions = quickanki.back;
        } else {
            notedef.definition = this.notes[nindex].css + this.notes[nindex].definitions[dindex];
            notedef.definitions = this.notes[nindex].css + this.notes[nindex].definitions.join('<hr>');
        }
        notedef.sentence = context;
        notedef.url = window.location.href;
        let response = await frontendApi.addNote(notedef);
        this.popup.sendMessage('setActionState', { response, params });
    }

    async api_playAudio(params) {
        let { nindex, dindex } = params;
        let url = this.notes[nindex].audios[dindex];
        let response = await frontendApi.playAudio(url);
    }

    api_playSound(params) {
        let url = params.sound;

        for (let key in this.audio) {
            this.audio[key].pause();
        }

        const audio = this.audio[url] || new Audio(url);
        audio.currentTime = 0;
        audio.play();

        this.audio[url] = audio;
    }

    api_resizePopup(params) {
        this.popup.resizeToContent(params);
    }

    buildNote(result) {
        //get 1 sentence around the expression.
        const expression = selectedText();
        const sentence = getSentence(this.maxContext);
        this.sentence = sentence;
        let tmpl = {
            css: '',
            expression,
            reading: '',
            extrainfo: '',
            definitions: '',
            sentence,
            url: '',
            audios: [],
        };

        //if 'result' is array with notes.
        if (Array.isArray(result)) {
            for (const item of result) {
                for (const key in tmpl) {
                    item[key] = item[key] ? item[key] : tmpl[key];
                }
            }
            return result;
        } else { // if 'result' is simple string, then return standard template.
            tmpl['definitions'] = [].concat(result);
            return [tmpl];
        }

    }

    async renderPopup(notes) {
        let content = '';
        let services = this.options ? this.options.services : '';
        let image = '';
        let imageclass = '';
        if (services != 'none') {
            image = (services == 'ankiconnect') ? 'plus.png' : 'cloud.png';
            imageclass = await frontendApi.isConnected() ? 'class="qa-addnote"' : 'class="qa-addnote-disabled"';
        }

        for (const [nindex, note] of notes.entries()) {
            content += note.css + '<div class="qa-note">';
            let audiosegment = '';
            if (note.audios) {
                for (const [dindex, audio] of note.audios.entries()) {
                    if (audio)
                        audiosegment += `<img class="qa-playaudio" data-nindex="${nindex}" data-dindex="${dindex}" src="${chrome.runtime.getURL('fg/img/play.png')}"/>`;
                }
            }
            content += `
                <div class="qa-headsection">
                    <span class="qa-audios">${audiosegment}</span>
                    <span class="qa-expression">${note.expression}</span>
                    <span class="qa-reading">${note.reading}</span>
                    <span class="qa-extra">${note.extrainfo}</span>
                </div>`;

            if (note.quickanki) {
                let button = (services == 'none' || services == '') ? '' : `<button class="qa-card-save qa-addnote" data-nindex="${nindex}" data-dindex="0">Guardar card</button>`;
                content += `
                    <div class="qa-quickanki-card" data-nindex="${nindex}">
                        <div class="qa-card-title">Card composer</div>
                        <div class="qa-card-subtitle">Edita antes de guardar en Anki</div>
                        <label>Front</label>
                        <div class="qa-quickanki-front" contenteditable="true">${this.escapeHtml(note.expression)}</div>
                        <label>Back</label>
                        <div class="qa-quickanki-back" contenteditable="true">${this.escapeHtml(note.back || '')}</div>
                        <label>Examples</label>
                        <div class="qa-quickanki-examples" contenteditable="true">${note.examples || ''}</div>
                        <div class="qa-card-actions">${button}</div>
                    </div>`;
                content += '</div>';
                continue;
            }

            for (const [dindex, definition] of note.definitions.entries()) {
                let button = (services == 'none' || services == '') ? '' : `<img ${imageclass} data-nindex="${nindex}" data-dindex="${dindex}" src="${chrome.runtime.getURL('fg/img/'+ image)}" />`;
                content += `<div class="qa-definition">${button}${definition}</div>`;
            }
            content += '</div>';
        }
        //content += `<textarea id="qa-context" class="qa-sentence">${this.sentence}</textarea>`;
        content += '<div id="qa-container" class="qa-sentence"></div>';
        return this.popupHeader() + content + this.popupFooter();
    }

    escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    popupHeader() {
        let root = chrome.runtime.getURL('/');
        return `
        <html lang="en">
            <head><meta charset="UTF-8"><title></title>
                <link rel="stylesheet" href="${root+'fg/css/frame.css'}">
                <link rel="stylesheet" href="${root+'fg/css/spell.css'}">
            </head>
            <body style="margin:0px;">
            <div class="qa-notes">`;
    }

    popupFooter() {
        let root = chrome.runtime.getURL('/');
        let services = this.options ? this.options.services : '';
        let image = (services == 'ankiconnect') ? 'plus.png' : 'cloud.png';
        let button = chrome.runtime.getURL('fg/img/' + image);
        let monolingual = this.options ? (this.options.monolingual == '1' ? 1 : 0) : 0;

        return `
            </div>
            <div class="icons hidden"">
                <img id="plus" src="${button}"/>
                <img id="load" src="${root+'fg/img/load.gif'}"/>
                <img id="good" src="${root+'fg/img/good.png'}"/>
                <img id="fail" src="${root+'fg/img/fail.png'}"/>
                <img id="play" src="${root+'fg/img/play.png'}"/>
                <div id="context">${this.sentence}</div>
                <div id="monolingual">${monolingual}</div>
                </div>
            <script src="${root+'fg/js/spell.js'}"></script>
            <script src="${root+'fg/js/frame.js'}"></script>
            </body>
        </html>`;
    }
}

window.qaFrontend = new QuickAnkiFrontend();
window.frontendApi= new FrontendAPI()
