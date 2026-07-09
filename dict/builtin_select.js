/* global api */
class builtin_select {

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('EN') != -1) return 'Select Dictionary';
        return 'Seleccione Diccionario';

    }
}