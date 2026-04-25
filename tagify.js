(function () {
    const KEYWORDS = {
        Block:      '#94a3b8',
        Fade:       '#c4b5fd',
        Char:       '#ff6633',
        Freeze:     '#66ddff',
        Shock:      '#ffdd00',
        Drown:      '#4488ff',
        Root:       '#44cc66',
        Weak:       '#cc6666',
        Strength:   '#d4af37',
        Daze:       '#cc9944',
        Blind:      '#f2f2f2',
        Lifesteal:  '#cc66ff',
        Foresight:  '#b8d0f5',
    };

    const TYPES = {
        Fire:    '#ff4422',
        Water:   '#2277ff',
        Rock:    '#a87832',
        Arc:     '#f97316',
        Ice:     '#88ddff',
        Shadow:  '#bb33ee',
        Light:   '#facc15',
        Grass:   '#22c55e',
    };

    const CLASSES = {
        Pyromancer:   '#ff4422',
        Tidecaller:   '#2277ff',
        Stonewarden:  '#a87832',
        Stormseeker:  '#f97316',
        Frostweaver:  '#88ddff',
        Shadowblade:  '#bb33ee',
        Dawnmage:     '#facc15',
        Verdantmaker: '#22c55e',
    };

    const ALL = { ...KEYWORDS, ...TYPES, ...CLASSES };
    const CLS = {};
    Object.keys(KEYWORDS).forEach(k => CLS[k] = 'tag-kw');
    Object.keys(TYPES).forEach(k => CLS[k] = 'tag-type');
    Object.keys(CLASSES).forEach(k => CLS[k] = 'tag-type');

    const terms   = Object.keys(ALL).sort((a, b) => b.length - a.length);
    const PATTERN = new RegExp(`(<[^>]*>)|(\\b(?:${terms.join('|')})\\b)`, 'g');

    window.tagify = function (html) {
        return String(html).replace(PATTERN, (match, tag, word) => {
            if (tag) return tag;
            return `<span class="${CLS[word]}" style="color:${ALL[word]}">${word}</span>`;
        });
    };
})();
