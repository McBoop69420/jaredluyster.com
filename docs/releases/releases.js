(function () {
    const PLATFORMS = [
        { key: 'ios', label: 'iOS · TestFlight' },
        { key: 'android', label: 'Android · Firebase' },
        { key: 'windows', label: 'Windows · itch.io' }
    ];
    // bad: the value that should render as a warning (null = informational only)
    const FLAGS = [
        { key: 'DuelModeEnabled', bad: true },
        { key: 'TutorialEnabled', bad: null }
    ];

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function flagChips(flags) {
        flags = flags || {};
        return FLAGS.map(f => {
            const v = flags[f.key];
            const missing = v === undefined || v === null;
            const cls = missing ? 'unk' : (f.bad !== null && v === f.bad) ? 'bad' : 'ok';
            return '<span class="flag ' + cls + '">' + esc(f.key) + ': ' + (missing ? 'unknown' : esc(v)) + '</span>';
        }).join('');
    }

    function platformStatus(rel, key) {
        const s = (rel.platforms || {})[key];
        return s ? String(s) : 'unknown';
    }

    function statusClass(s) {
        return s === 'live' ? 'st-live' : s === 'unknown' ? 'st-unknown' : 'st-pending';
    }

    function render(data) {
        const releases = (data.releases || []).slice().sort((a, b) => (b.build || 0) - (a.build || 0));
        const un = data.unreleased;

        $('generated').textContent = data.generated
            ? 'Snapshot generated ' + data.generated + (data.bundleVersion ? ' · version ' + data.bundleVersion : '')
            : 'No snapshot yet. Run the export script in the game repo.';

        const warn = [];
        if (un && un.flags && un.flags.DuelModeEnabled === true) warn.push('main (unreleased)');
        releases.forEach(r => {
            if (r.flags && r.flags.DuelModeEnabled === true) warn.push('build ' + r.build);
        });
        $('banner').innerHTML = warn.length
            ? '<div class="rel-banner">DuelModeEnabled is TRUE in:<ul>' +
              warn.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>'
            : '';

        $('platforms').innerHTML = PLATFORMS.map(p => {
            const rel = releases.find(r => platformStatus(r, p.key) === 'live');
            return '<div class="rel-card"><div class="label">' + esc(p.label) + '</div>' +
                '<div class="value ' + (rel ? 'st-live' : 'st-unknown') + '">' +
                (rel ? 'b' + esc(rel.build) : 'unknown') + '</div>' +
                '<div class="sub">' + (rel ? esc(rel.date || '') : 'no build marked live') + '</div></div>';
        }).join('');

        if (!un) {
            $('unreleased').innerHTML = '<p class="rel-empty">No data.</p>';
        } else {
            const commits = un.commits || [];
            const checks = [['Working tree clean', un.clean], ['Main pushed', un.pushed]].map(pair => {
                const ok = pair[1];
                return '<span class="flag ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'unk') + '">' +
                    pair[0] + ': ' + (ok === true ? 'yes' : ok === false ? 'NO' : 'unknown') + '</span>';
            }).join('');
            $('unreleased').innerHTML = '<div class="rel-entry"><div class="rel-checks">' + flagChips(un.flags) + checks +
                '</div><div class="meta">' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') +
                ' since ' + esc(un.since || 'last tag') + '</div>' +
                (commits.length ? '<ul class="commits">' + commits.map(c =>
                    '<li>' + esc(c.subject || c) + (c.sha ? ' <span class="meta">' + esc(c.sha) + '</span>' : '') + '</li>'
                ).join('') + '</ul>' : '') + '</div>';
        }

        $('history').innerHTML = releases.length ? releases.map(r =>
            '<article class="rel-entry"><header><h3>Build ' + esc(r.build) + '</h3><span class="meta">' +
            [r.tag, r.date, r.sha, r.bundleVersion ? 'v' + r.bundleVersion : ''].filter(Boolean).map(esc).join(' · ') +
            '</span></header><div class="rel-checks">' + flagChips(r.flags) + '</div><div>' +
            PLATFORMS.map(p => {
                const s = platformStatus(r, p.key);
                return '<span class="flag ' + statusClass(s) + '">' + esc(p.label.split(' ')[0]) + ': ' + esc(s) + '</span>';
            }).join('') + '</div>' +
            (r.changelog ? '<pre class="changelog">' + esc(r.changelog) + '</pre>' : '') + '</article>'
        ).join('') : '<p class="rel-empty">No tagged releases yet.</p>';
    }

    fetch('releases.json', { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(render)
        .catch(() => { $('generated').textContent = 'Could not load releases.json.'; });
})();
