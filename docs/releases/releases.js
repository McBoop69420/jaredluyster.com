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
    const ACTIONS = { submitted: 'st-pending', live: 'st-live', pulled: 'st-unknown', failed: 'st-bad' };

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const label = key => (PLATFORMS.find(p => p.key === key) || { label: key }).label;

    function flagChips(flags) {
        flags = flags || {};
        return FLAGS.map(f => {
            const v = flags[f.key];
            const missing = v === undefined || v === null;
            const cls = missing ? 'unk' : (f.bad !== null && v === f.bad) ? 'bad' : 'ok';
            return '<span class="flag ' + cls + '">' + esc(f.key) + ': ' + (missing ? 'unknown' : esc(v)) + '</span>';
        }).join('');
    }

    // Cross-check the hand-kept ledger against the git snapshot.
    function audit(ledger, releases) {
        const byBuild = {};
        releases.forEach(r => { byBuild[r.build] = r; });
        const issues = [];
        ledger.forEach(e => {
            const r = byBuild[e.build];
            if (!r) {
                issues.push('Ledger has build ' + e.build + ' (' + label(e.platform) + ', ' + e.action + ') but git has no tag for it.');
            } else if (e.action !== 'pulled' && e.action !== 'failed' && r.flags && r.flags.DuelModeEnabled === true) {
                issues.push('Build ' + e.build + ' reached ' + label(e.platform) + ' with DuelModeEnabled true.');
            }
            if (!e.by || !e.date) issues.push('Ledger entry for build ' + e.build + ' (' + label(e.platform) + ') is missing who or when.');
        });
        const ledgered = new Set(ledger.map(e => e.build));
        releases.forEach(r => {
            if (!ledgered.has(r.build)) issues.push('Build ' + r.build + ' is tagged in git but never recorded as shipped anywhere.');
        });
        return issues;
    }

    function taskIssues(tasks) {
        const issues = [];
        tasks.filter(t => t.status !== 'done').forEach(t => {
            if (!t.owner) issues.push('Task "' + t.title + '" has no owner.');
        });
        return issues;
    }

    function taskRow(t) {
        const open = t.status !== 'done';
        const st = t.status === 'done' ? 'st-live' : t.status === 'blocked' ? 'st-bad' : t.status === 'doing' ? 'st-pending' : 'st-unknown';
        return '<div class="task' + (t.status === 'blocked' ? ' blocked' : '') + '">' +
            '<span class="flag ' + st + '">' + esc(t.status) + '</span><span class="title">' + esc(t.title) + '</span>' +
            '<span class="meta">' + esc(t.owner || 'NO OWNER') +
            (t.done ? ' · done ' + esc(t.done) : '') + '</span>' +
            (t.note ? '<span class="note">' + esc(t.note) + '</span>' : '') + '</div>';
    }

    let ownerFilter = 'all';

    function renderTasks(allTasks) {
        const owners = Array.from(new Set(allTasks.map(t => t.owner || 'unowned'))).sort();
        $('owner-filter').innerHTML = ['all'].concat(owners).map(o => {
            const n = allTasks.filter(t => t.status !== 'done' && (o === 'all' || (t.owner || 'unowned') === o)).length;
            return '<button type="button" data-owner="' + esc(o) + '" class="' + (o === ownerFilter ? 'active' : '') + '">' +
                esc(o) + ' (' + n + ')</button>';
        }).join('');
        Array.prototype.forEach.call($('owner-filter').querySelectorAll('button'), b => {
            b.onclick = () => { ownerFilter = b.getAttribute('data-owner'); renderTasks(allTasks); };
        });
        const tasks = allTasks.filter(t => ownerFilter === 'all' || (t.owner || 'unowned') === ownerFilter);
        const rank = t => (t.status === 'blocked' ? 0 : t.status === 'doing' ? 1 : 2);
        const open = tasks.filter(t => t.status !== 'done')
            .sort((a, b) => rank(a) - rank(b) || (a.id || 0) - (b.id || 0));
        const done = tasks.filter(t => t.status === 'done').sort((a, b) => String(b.done).localeCompare(String(a.done)));
        $('tasks').innerHTML = open.length ? open.map(taskRow).join('') : '<p class="rel-empty">Nothing open.</p>';
        $('done').innerHTML = done.map(taskRow).join('');
        $('done-wrap').style.display = done.length ? '' : 'none';
    }

    function render(data, ledgerData, taskData) {
        const tasks = taskData.tasks || [];
        renderTasks(tasks);
        const releases = (data.releases || []).slice().sort((a, b) => (b.build || 0) - (a.build || 0));
        const un = data.unreleased;
        const ledger = (ledgerData.entries || []).slice().sort((a, b) =>
            String(b.date).localeCompare(String(a.date)) || (b.build || 0) - (a.build || 0));

        $('generated').textContent = (ledger.length
            ? ledger.length + ' ledger entr' + (ledger.length === 1 ? 'y' : 'ies')
            : 'Ledger is empty') +
            (data.generated ? ' · git snapshot ' + data.generated : ' · no git snapshot yet');

        const issues = audit(ledger, releases).concat(taskIssues(tasks));
        if (un && un.flags && un.flags.DuelModeEnabled === true) issues.unshift('DuelModeEnabled is true on main right now.');
        $('banner').innerHTML = issues.length
            ? '<div class="rel-banner">' + issues.length + ' accountability issue' + (issues.length === 1 ? '' : 's') +
              ':<ul>' + issues.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></div>'
            : '';

        // Current build per platform = most recent ledger entry that says live.
        $('platforms').innerHTML = PLATFORMS.map(p => {
            const e = ledger.find(x => x.platform === p.key && x.action === 'live');
            return '<div class="rel-card"><div class="label">' + esc(p.label) + '</div>' +
                '<div class="value ' + (e ? 'st-live' : 'st-unknown') + '">' + (e ? 'b' + esc(e.build) : 'unknown') + '</div>' +
                '<div class="sub">' + (e ? esc(e.date) + ' · ' + esc(e.by || '?') : 'nothing recorded live') + '</div></div>';
        }).join('');

        $('ledger').innerHTML = ledger.length ? ledger.map(e =>
            '<div class="rel-entry"><header><h3>Build ' + esc(e.build) + ' → ' + esc(label(e.platform)) +
            '</h3><span class="flag ' + (ACTIONS[e.action] || 'st-unknown') + '">' + esc(e.action) + '</span>' +
            '<span class="meta">' + esc(e.date) + ' · by ' + esc(e.by || '?') + '</span></header>' +
            (e.note ? '<div class="meta">' + esc(e.note) + '</div>' : '') + '</div>'
        ).join('') : '<p class="rel-empty">Nothing recorded yet. Every submission, go-live and pull goes here.</p>';

        if (!un) {
            $('unreleased').innerHTML = '<p class="rel-empty">No git snapshot.</p>';
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
            '</span></header><div class="rel-checks">' + flagChips(r.flags) + '</div>' +
            (r.changelog ? '<pre class="changelog">' + esc(r.changelog) + '</pre>' : '') + '</article>'
        ).join('') : '<p class="rel-empty">No tagged releases yet.</p>';
    }

    const load = (url, fallback) => fetch(url, { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(() => fallback);

    Promise.all([load('releases.json', {}), load('ledger.json', null), load('tasks.json', null)]).then(res => {
        if (res[1] === null || res[2] === null) { $('generated').textContent = 'Could not load ledger.json or tasks.json.'; return; }
        render(res[0], res[1], res[2]);
    });
})();
