/* global spell */
function getImageSource(id) {
    return document.querySelector(`#${id}`).src;
}

function registerAddNoteLinks() {
    for (let link of document.getElementsByClassName('qa-addnote')) {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            const quickCard = e.currentTarget.closest('.qa-quickanki-card');
            setActionVisual(e.currentTarget, 'loading');
            window.parent.postMessage({
                action: 'addNote',
                params: {
                    nindex: ds.nindex,
                    dindex: ds.dindex,
                    context: document.querySelector('.spell-content').innerHTML,
                    quickanki: quickCard ? {
                        front: quickCard.querySelector('.qa-quickanki-front').innerText.trim(),
                        back: quickCard.querySelector('.qa-quickanki-back').innerText.trim(),
                        examples: quickCard.querySelector('.qa-quickanki-examples').innerHTML.trim()
                    } : null
                }
            }, '*');
        });
    }
}

function setActionVisual(element, state) {
    if (!element) return;
    if (element.tagName === 'BUTTON') {
        if (state === 'loading') element.textContent = 'Guardando...';
        if (state === 'good') element.textContent = 'Guardado';
        if (state === 'fail') element.textContent = 'Error';
        element.dataset.state = state;
        return;
    }

    if (state === 'loading') element.src = getImageSource('load');
    if (state === 'good') element.src = getImageSource('good');
    if (state === 'fail') element.src = getImageSource('fail');
    if (state === 'idle') element.src = getImageSource('plus');
}

function registerAudioLinks() {
    for (let link of document.getElementsByClassName('qa-playaudio')) {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            window.parent.postMessage({
                action: 'playAudio',
                params: {
                    nindex: ds.nindex,
                    dindex: ds.dindex
                }
            }, '*');
        });
    }
}

function registerSoundLinks() {
    for (let link of document.getElementsByClassName('qa-playsound')) {
        link.setAttribute('src', getImageSource('play'));
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            window.parent.postMessage({
                action: 'playSound',
                params: {
                    sound: ds.sound,
                }
            }, '*');
        });
    }
}

function initSpellnTranslation(){
    document.querySelector('#qa-container').appendChild(spell());
    document.querySelector('.spell-content').innerHTML=document.querySelector('#context').innerHTML;
    if (document.querySelector('#monolingual').innerText == '1')
        hideTranslation();
}

function registerHiddenClass() {
    for (let div of document.getElementsByClassName('qa-definition')) {
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            hideTranslation();
        });
    }
}

function hideTranslation(){
    let className = 'span.chn_dis, span.chn_tran, span.chn_sent, span.tgt_tran, span.tgt_sent'; // to add your bilingual translation div class name here.
    for (let div of document.querySelectorAll(className)) {
        div.classList.toggle('hidden');
    }
}

function onDomContentLoaded() {
    registerAddNoteLinks();
    registerAudioLinks();
    registerSoundLinks();
    registerHiddenClass();
    initSpellnTranslation();
    requestPopupResize();
    setTimeout(requestPopupResize, 50);
}

function requestPopupResize() {
    const body = document.body;
    const html = document.documentElement;
    const width = Math.min(Math.max(html.scrollWidth, body.scrollWidth, 680), 780) + 20;
    const height = Math.max(html.scrollHeight, body.scrollHeight) + 16;
    window.parent.postMessage({
        action: 'resizePopup',
        params: { width, height }
    }, '*');
}

function onMessage(e) {
    const { action, params } = e.data;
    const method = window['api_' + action];
    if (typeof(method) === 'function') {
        method(params);
    }
}

function api_setActionState(result) {
    const { response, params } = result;
    const { nindex, dindex } = params;

    const match = document.querySelector(`.qa-addnote[data-nindex="${nindex}"].qa-addnote[data-dindex="${dindex}"]`);
    if (response)
        setActionVisual(match, 'good');
    else
        setActionVisual(match, 'fail');

    setTimeout(() => {
        if (match && match.tagName === 'BUTTON') {
            match.textContent = 'Guardar card';
            match.dataset.state = 'idle';
        } else {
            setActionVisual(match, 'idle');
        }
    }, 1000);
}

function onMouseWheel(e) {
    document.querySelector('html').scrollTop -= e.wheelDeltaY / 3;
    document.querySelector('body').scrollTop -= e.wheelDeltaY / 3;
    e.preventDefault();
}

document.addEventListener('DOMContentLoaded', onDomContentLoaded, false);
window.addEventListener('message', onMessage);
window.addEventListener('wheel', onMouseWheel, {passive: false});
