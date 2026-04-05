(() => {
    var N = Object.create;
    var D = Object.defineProperty;
    var R = Object.getOwnPropertyDescriptor;
    var H = Object.getOwnPropertyNames;
    var Q = Object.getPrototypeOf,
        U = Object.prototype.hasOwnProperty;
    var P = (t, r, o, i) => {
        if (r && typeof r == "object" || typeof r == "function")
            for (let u of H(r)) !U.call(t, u) && u !== o && D(t, u, {
                get: () => r[u],
                enumerable: !(i = R(r, u)) || i.enumerable
            });
        return t
    };
    var O = (t, r, o) => (o = t != null ? N(Q(t)) : {}, P(r || !t || !t.__esModule ? D(o, "default", {
        value: t,
        enumerable: !0
    }) : o, t));
    var e = O(require("./state.js")),
        n = require("./helpers.js"),
        j = require("./api.js");
    const S = ["\u0627\u0644\u0635\u0631\u0641", "\u0627\u0644\u0641\u0644\u0633\u0641\u0629 \u0648\u0639\u0644\u0645 \u0627\u0644\u0623\u062E\u0644\u0627\u0642", "\u0627\u0644\u0642\u0636\u0627\u064A\u0627 \u0627\u0644\u0645\u062C\u062A\u0645\u0639\u064A\u0629", "\u0627\u0644\u0646\u062D\u0648 \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u064A", "\u0639\u0644\u0645 \u0627\u0644\u0628\u064A\u0627\u0646", "\u0639\u0644\u0645 \u0627\u0644\u0644\u063A\u0629 \u0648\u0641\u0642\u0647\u0647\u0627", "\u0646\u0635\u0648\u0635 \u0627\u0644\u0623\u062F\u0628 \u0627\u0644\u062C\u0627\u0647\u0644\u064A"],
        F = (t, r) => {
            let o;
            return function(...u) {
                const s = () => {
                    clearTimeout(o), t(...u)
                };
                clearTimeout(o), o = setTimeout(s, r)
            }
        };

    function z() {
        return e.default.currentViewMode === "notes" ? {
            filtersId: "notes-subject-filters-container",
            historyId: "notes-history-tree"
        } : {
            filtersId: "subject-filters-container",
            historyId: "history-tree"
        }
    }

    function B(t) {
        t && requestAnimationFrame(() => {
            const r = t.querySelector("button[onclick*='content-year-'], button[onclick*='edit-content-year-']");
            if (!r) return;
            const o = r.nextElementSibling;
            o && o.classList.contains("hidden") && (o.classList.remove("hidden"), o.classList.add("block"));
            const i = r.querySelector(".fa-chevron-down, .bi-chevron-down");
            i && i.classList.add("rotate-180");
            const u = o == null ? void 0 : o.querySelector("button[onclick*='content-month-'], button[onclick*='edit-content-month-']");
            if (!u) return;
            const s = u.nextElementSibling;
            s && s.classList.contains("hidden") && (s.classList.remove("hidden"), s.classList.add("block"));
            const l = u.querySelector(".fa-chevron-down, .bi-chevron-down");
            l && l.classList.add("rotate-180")
        })
    }

    function q() {
        (0, n.logFunctionStatus)("getDynamicSubjects", !1);
        const t = new Set(S);
        return (e.default.currentViewMode === "notes" ? e.default.allNotes : e.default.allQuizzes).forEach(o => {
            o.config && o.config.subject && t.add(o.config.subject)
        }), ["\u0627\u0644\u0643\u0644", ...Array.from(t)]
    }

    function M(t, r) {
        (0, n.logFunctionStatus)("renderSubjectFilters", !1);
        const o = q(),
            i = document.getElementById("subjects-list");
        if (i) {
            let d = "";
            o.forEach(x => {
                x !== "\u0627\u0644\u0643\u0644" && (d += `<option value="${(0,n.escapeHtml)(x)}">`)
            }), i.innerHTML = d
        }
        const {
            filtersId: u
        } = z(), s = document.getElementById(u);
        if (s) {
            let d = "";
            o.forEach(x => {
                const c = x === e.default.currentSubjectFilter,
                    a = c ? "bg-blue-600 text-white shadow-md border-blue-500" : "bg-slate-700/40 text-gray-300 border-slate-600/30 backdrop-blur-md hover:border-slate-500/50 hover:text-gray-200";
                let b = "";
                e.default.isAdmin && x !== "\u0627\u0644\u0643\u0644" && (b = `
                    <span class="inline-flex items-center gap-2 mr-3 pr-3 border-r ${c?"border-blue-400":"border-slate-500/40"}">
                        <i onclick="renameSubject('${(0,n.escapeHtml)(x)}', event)" class="fas fa-pen text-xs hover:text-blue-300 transition cursor-pointer" title="\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u0633\u0645"></i>
                        <i onclick="confirmDeleteSubject('${(0,n.escapeHtml)(x)}', event)" class="fas fa-times text-xs hover:text-red-400 transition cursor-pointer" title="\u062D\u0630\u0641 \u0627\u0644\u0645\u062C\u0644\u062F"></i>
                    </span>
                `), d += `
                <button onclick="setSubjectFilter('${(0,n.escapeHtml)(x)}')" class="flex items-center whitespace-nowrap px-4 py-2 rounded-full border text-sm font-bold transition duration-300 ${a}">
                    ${(0,n.escapeHtml)(x)} ${b}
                </button>
            `
            }), s.innerHTML = d
        }
        const l = document.getElementById("edit-subject-filters-container");
        if (l) {
            let d = "";
            o.forEach(x => {
                const a = x === e.default.editSubjectFilter ? "bg-purple-600 text-white shadow-md border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:bg-purple-50 hover:text-purple-600";
                d += `<button onclick="setEditSubjectFilter('${(0,n.escapeHtml)(x)}')" class="whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-bold transition duration-300 ${a}">${(0,n.escapeHtml)(x)}</button>`
            }), l.innerHTML = d
        }
    }
    let $ = null;

    function G(t, r, o, i) {
        (0, n.logFunctionStatus)("setSubjectFilter", !1), e.default.currentSubjectFilter = t, M(o, i), $ || ($ = F(r, 300)), $()
    }
    let E = null;

    function Y(t, r, o, i) {
        (0, n.logFunctionStatus)("setEditSubjectFilter", !1), e.default.editSubjectFilter = t, M(o, i), E || (E = F(r, 300)), E()
    }

    function I(t, r) {
        (0, n.logFunctionStatus)("renderHistoryTree", !1);
        const {
            historyId: o
        } = z(), i = document.getElementById(o);
        if (!i) return;
        i.innerHTML = "";
        let s = (e.default.currentViewMode === "notes" ? e.default.allNotes : e.default.allQuizzes).map((a, b) => ({
            data: a,
            originalIndex: b
        }));
        if (e.default.currentSubjectFilter !== "\u0627\u0644\u0643\u0644" && (s = s.filter(a => a.data.config.subject === e.default.currentSubjectFilter)), s.length === 0) {
            i.innerHTML = '<div class="p-5 rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-gray-500 text-sm font-medium">\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0633\u062C\u0644\u0629 \u0647\u0646\u0627 \u062D\u0627\u0644\u064A\u0627\u064B.</div>';
            return
        }
        const l = {};
        s.forEach(a => {
            const b = a.data.config;
            let p = Date.now();
            const h = a.data.createdAt || b.createdAt || a.data.updatedAt;
            if (h) {
                const m = new Date(h).getTime();
                isNaN(m) || (p = m)
            } else {
                const m = b.id;
                if (typeof m == "string" && m.includes("-")) {
                    const T = parseInt(m.split("-")[1]);
                    isNaN(T) || (p = T)
                }
            }
            const g = new Date(p),
                f = g.getFullYear(),
                y = g.toLocaleDateString("ar-EG", {
                    month: "long"
                }),
                v = g.getMonth() + 1,
                w = g.getDate();
            l[f] || (l[f] = {}), l[f][v] || (l[f][v] = {
                name: y,
                days: {}
            }), l[f][v].days[w] || (l[f][v].days[w] = []), l[f][v].days[w].push(a)
        });
        let d = "";
        const x = e.default.currentViewMode === "notes" ? "rose" : "emerald";
        Object.keys(l).sort((a, b) => b - a).forEach(a => {
            d += `
            <div id="year-${a}" class="mb-2">
                <button onclick="toggleTreeNode('content-year-${a}', this)" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-gray-100 p-3 rounded-2xl hover:bg-gray-200 transition">
                    <span><i class="bi bi-calendar3 text-${x}-500 ml-2"></i> ${a}</span>
                    <i class="bi bi-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="content-year-${a}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `, Object.keys(l[a]).sort((p, h) => h - p).forEach(p => {
                const h = l[a][p].name,
                    g = `${a}-${p}`;
                d += `
                <div id="month-${g}" class="mb-2">
                    <button onclick="toggleTreeNode('content-month-${g}', this)" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-3 hover:bg-${x}-50 rounded-2xl transition">
                        <span><i class="bi bi-folder2-open text-yellow-500 ml-2"></i> ${h}</span>
                        <i class="bi bi-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="content-month-${g}" class="pr-5 mt-1 space-y-3 border-r-2 border-${x}-100 hidden">
            `, Object.keys(l[a][p].days).sort((y, v) => v - y).forEach(y => {
                    const v = `${a}-${p}-${y}`;
                    d += `
                    <div id="day-${v}" class="mb-2 relative">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-3 h-3 rounded-full bg-green-500 shadow-sm border-2 border-white absolute -right-[23px]"></span>
                            <span class="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md">\u064A\u0648\u0645 ${y}</span>
                        </div>
                        <div id="content-day-${v}" class="pr-2 space-y-2">
                `, l[a][p].days[y].forEach(w => {
                        const m = w.data.config,
                            T = `${window.location.origin}/?quiz=${encodeURIComponent(String(m.id))}`;
                        if (e.default.currentViewMode === "exams") d += `
                            <div class="group mb-2">
                                <div onclick="playQuiz(${w.originalIndex})" class="p-3 bg-white rounded-3xl border border-gray-200 shadow-md hover:shadow-lg hover:border-emerald-300 transition cursor-pointer">
                                    <p class="font-bold text-gray-900 text-sm group-hover:text-emerald-600 transition truncate">${(0,n.escapeHtml)(m.title)}</p>
                                    ${m.description?`<p class="text-xs text-gray-500 mt-1 truncate">${(0,n.escapeHtml)(m.description)}</p>`:""}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-600">
                                        <span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${(0,n.escapeHtml)(m.subject||"\u0628\u062F\u0648\u0646 \u0645\u0627\u062F\u0629")}</span>
                                        <span class="bg-gray-100 px-2 py-1 rounded text-gray-700 font-medium"><i class="far fa-clock"></i> ${m.timeLimit/60} \u062F</span>
                                    </div>
                                    <div class="mt-2 flex items-center gap-2 text-xs" onclick="event.stopPropagation()">
                                        <span class="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-bold">\u0631\u0627\u0628\u0637</span>
                                        <div class="flex-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 truncate" dir="ltr">
                                            ${(0,n.escapeHtml)(T)}
                                        </div>
                                        <button class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition" onclick="copyQuizLink('${(0,n.escapeHtml)(String(m.id))}', event)">
                                            \u0646\u0633\u062E
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                        else {
                            const A = m.type === "ppt" ? "bi-file-earmark-slides-fill text-emerald-500" : "bi-file-earmark-pdf-fill text-rose-500",
                                C = encodeURI(m.link || "");
                            d += `
                            <div class="group mb-2">
                                <div onclick="forceDownload('${C}')" class="p-3 bg-white rounded-3xl border border-gray-200 shadow-md hover:shadow-lg hover:border-rose-300 transition cursor-pointer">
                                    <div class="flex justify-between items-start">
                                        <p class="font-bold text-gray-900 text-sm group-hover:text-rose-600 transition truncate pr-2">${(0,n.escapeHtml)(m.title)}</p>
                                        <i class="bi ${A} text-lg"></i>
                                    </div>
                                    ${m.description?`<p class="text-xs text-gray-500 mt-1 truncate">${(0,n.escapeHtml)(m.description)}</p>`:""}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-600">
                                        <span class="bg-rose-100 text-rose-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${(0,n.escapeHtml)(m.subject||"\u0628\u062F\u0648\u0646 \u0645\u0627\u062F\u0629")}</span>
                                        <span class="bg-rose-100 px-2 py-1 rounded text-rose-700 font-bold hover:bg-rose-200 transition">\u062A\u062D\u0645\u064A\u0644 \u0645\u0628\u0627\u0634\u0631 <i class="fas fa-download ml-1"></i></span>
                                    </div>
                                </div>
                            </div>
                        `
                        }
                    }), d += "</div></div>"
                }), d += "</div></div>"
            }), d += "</div></div>"
        }), i.innerHTML = d, B(i)
    }

    function k(t, r) {
        (0, n.logFunctionStatus)("renderEditTree", !1);
        const o = document.getElementById("edit-history-tree");
        if (!o) return;
        o.innerHTML = "";
        let u = (e.default.editTabMode === "exams" ? e.default.allQuizzes : e.default.allNotes).map((c, a) => ({
            data: c,
            originalIndex: a
        }));
        if (e.default.editSubjectFilter !== "\u0627\u0644\u0643\u0644" && (u = u.filter(c => c.data.config.subject === e.default.editSubjectFilter)), u.length === 0) {
            o.innerHTML = '<div class="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm text-center text-gray-500 text-sm font-medium">\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062D\u062A\u0648\u0649 \u0645\u0633\u062C\u0644 \u0647\u0646\u0627 \u0644\u062A\u0639\u062F\u064A\u0644\u0647.</div>';
            return
        }
        const s = {};
        u.forEach(c => {
            const a = c.data.config,
                b = String(a.id || ""),
                p = b.includes("-") ? parseInt(b.split("-")[1]) || Date.now() : c.data.createdAt ? new Date(c.data.createdAt).getTime() : Date.now(),
                h = new Date(p),
                g = h.getFullYear(),
                f = h.toLocaleDateString("ar-EG", {
                    month: "long"
                }),
                y = h.getMonth() + 1;
            s[g] || (s[g] = {}), s[g][y] || (s[g][y] = {
                name: f,
                items: []
            }), s[g][y].items.push(c)
        });
        let l = "";
        const d = e.default.editTabMode === "exams" ? "emerald" : "rose";
        Object.keys(s).sort((c, a) => a - c).forEach(c => {
            l += `
            <div id="edit-year-${c}" class="mb-2">
                <button onclick="toggleTreeNode('edit-content-year-${c}', this)" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-white shadow-sm border border-gray-100 p-3 rounded-2xl hover:bg-gray-50 transition">
                    <span><i class="bi bi-calendar3 text-${d}-500 ml-2"></i> ${c}</span>
                    <i class="bi bi-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="edit-content-year-${c}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `, Object.keys(s[c]).sort((b, p) => p - b).forEach(b => {
                const p = s[c][b].name,
                    h = `${c}-${b}`;
                l += `
                <div id="edit-month-${h}" class="mb-2">
                    <button onclick="toggleTreeNode('edit-content-month-${h}', this)" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-3 hover:bg-${d}-50 rounded-2xl transition">
                        <span><i class="bi bi-folder2-open text-yellow-500 ml-2"></i> ${p}</span>
                        <i class="bi bi-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="edit-content-month-${h}" class="pr-5 mt-1 space-y-2 border-r-2 border-${d}-100 hidden">
            `, s[c][b].items.forEach(g => {
                    const f = g.data.config,
                        y = `${window.location.origin}/?quiz=${encodeURIComponent(String(f.id))}`;
                    e.default.editTabMode === "exams" ? l += `
                        <div class="mb-2 flex items-center gap-2">

                            <!-- \u2705 \u0632\u0631 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 -->
                               <div onclick="loadQuizIntoBuilder(${g.originalIndex})"
                                   class="group flex-1 p-3 bg-white rounded-3xl border border-gray-100 shadow-sm
                                        hover:shadow-md hover:border-emerald-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-emerald-600 transition truncate">
                                        ${(0,n.escapeHtml)(f.title)}
                                    </p>
                                    <i class="fas fa-pen text-emerald-200 group-hover:text-emerald-500 transition ml-2 flex-shrink-0"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">
                                        ${(0,n.escapeHtml)(f.subject||"\u0628\u062F\u0648\u0646 \u0645\u0627\u062F\u0629")}
                                    </span>
                                </div>
                                <div class="mt-2 flex items-center gap-2 text-xs" onclick="event.stopPropagation()">
                                    <span class="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-bold">\u0631\u0627\u0628\u0637</span>
                                    <div class="flex-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 truncate" dir="ltr">
                                        ${(0,n.escapeHtml)(y)}
                                    </div>
                                    <button class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition" onclick="copyQuizLink('${(0,n.escapeHtml)(String(f.id))}', event)">
                                        \u0646\u0633\u062E
                                    </button>
                                </div>
                            </div>

                            <!-- \u2705 \u0632\u0631 \u0627\u0644\u062D\u0630\u0641 \u0645\u0646\u0641\u0635\u0644 \u062E\u0627\u0631\u062C \u0643\u0627\u0631\u062F \u0627\u0644\u062A\u0639\u062F\u064A\u0644 -->
                            ${e.default.isAdmin?`
                            <button onclick="deleteExamFromEditTree('${(0,n.escapeHtml)(f.id)}', event)"
                                    class="flex-shrink-0 w-9 h-9 flex items-center justify-center
                                           bg-red-50 hover:bg-red-500 text-red-500 hover:text-white
                                     rounded-2xl border border-red-100 hover:border-red-500
                                           shadow-sm transition duration-200"
                                    title="\u062D\u0630\u0641 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646">
                                <i class="fas fa-trash text-sm"></i>
                            </button>`:""}

                        </div>
                    ` : l += `
                        <div class="mb-2 flex items-center gap-2">

                            <!-- \u2705 \u0632\u0631 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 -->
                               <div onclick="loadNoteIntoBuilder(${g.originalIndex})"
                                   class="group flex-1 p-3 bg-white rounded-3xl border border-gray-100 shadow-sm
                                        hover:shadow-md hover:border-rose-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-rose-600 transition truncate">
                                        ${(0,n.escapeHtml)(f.title)}
                                    </p>
                                    <i class="fas fa-pen text-rose-200 group-hover:text-rose-500 transition ml-2 flex-shrink-0"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-rose-50 text-rose-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">
                                        ${(0,n.escapeHtml)(f.subject||"\u0628\u062F\u0648\u0646 \u0645\u0627\u062F\u0629")}
                                    </span>
                                </div>
                            </div>

                            <!-- \u2705 \u0632\u0631 \u0627\u0644\u062D\u0630\u0641 \u0645\u0646\u0641\u0635\u0644 \u062E\u0627\u0631\u062C \u0643\u0627\u0631\u062F \u0627\u0644\u062A\u0639\u062F\u064A\u0644 -->
                            ${e.default.isAdmin?`
                            <button onclick="deleteNoteFromEditTree('${(0,n.escapeHtml)(f.id)}', event)"
                                    class="flex-shrink-0 w-9 h-9 flex items-center justify-center
                                           bg-red-50 hover:bg-red-500 text-red-500 hover:text-white
                                     rounded-2xl border border-red-100 hover:border-red-500
                                           shadow-sm transition duration-200"
                                    title="\u062D\u0630\u0641 \u0627\u0644\u0645\u0630\u0643\u0631\u0629">
                                <i class="fas fa-trash text-sm"></i>
                            </button>`:""}

                        </div>
                    `
                }), l += "</div></div>"
            }), l += "</div></div>"
        }), o.innerHTML = l, B(o)
    }

    function J(t, r) {
        (0, n.logFunctionStatus)("renameSubject", !1), r.stopPropagation(), e.default.subjectToRename = t;
        const o = document.getElementById("rename-subject-input");
        o.value = t, document.getElementById("rename-subject-modal").classList.remove("hidden"), setTimeout(() => o.select(), 100)
    }

    function L() {
        (0, n.logFunctionStatus)("closeRenameModal", !1), e.default.subjectToRename = null, document.getElementById("rename-subject-modal").classList.add("hidden")
    }
    async function K(t, r, o) {
        (0, n.logFunctionStatus)("executeRenameSubject", !0);
        const i = document.getElementById("rename-subject-input").value.trim();
        if (i === "") {
            (0, n.showAlert)("\u26A0\uFE0F \u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0635\u062D\u064A\u062D \u0644\u0644\u0645\u0627\u062F\u0629!", "warning");
            return
        }
        if (e.default.subjectToRename && i !== e.default.subjectToRename) {
            console.log(`[renameSubject] \u0628\u062F\u0621 \u062A\u0639\u062F\u064A\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0627\u062F\u0629 \u2014 "${e.default.subjectToRename}" \u2192 "${i}"`);
            try {
                const s = await (0, j.apiCall)("PUT", "/api/quizzes/subject/rename", {
                    oldName: e.default.subjectToRename,
                    newName: i
                });
                console.log(`[renameSubject] \u2713 \u062A\u0645 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u2014 ${s.modifiedCount||0} \u0627\u0645\u062A\u062D\u0627\u0646 \u062A\u0623\u062B\u0631`)
            } catch (s) {
                console.error("[renameSubject] \u2717 \u0641\u0634\u0644:", s.message), (0, n.showAlert)("\u26A0\uFE0F \u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0627\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631: " + s.message, "warning")
            }
            try {
                const s = await (0, j.apiCall)("GET", "/api/quizzes"),
                    l = Array.isArray(s) ? s : (s == null ? void 0 : s.data) || [];
                e.default.allQuizzes = l.map(d => ({
                    id: d.id,
                    config: {
                        id: d.id,
                        title: d.title,
                        subject: d.subject,
                        description: d.description || "",
                        timeLimit: d.timeLimit || 1500,
                        closingMessage: d.closingMessage || "\u0634\u0643\u0631\u0627\u064B \u0644\u0645\u0634\u0627\u0631\u0643\u062A\u0643!"
                    },
                    questions: d.questions || []
                }))
            } catch (s) {
                (0, n.showAlert)("\u26A0\uFE0F \u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0628\u0639\u062F \u062A\u0639\u062F\u064A\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0627\u062F\u0629: " + s.message, "warning")
            }
            const u = S.indexOf(e.default.subjectToRename);
            u !== -1 && (S[u] = i), e.default.currentSubjectFilter === e.default.subjectToRename && (e.default.currentSubjectFilter = i), e.default.editSubjectFilter === e.default.subjectToRename && (e.default.editSubjectFilter = i), L(), t && t(), r && r(), o && o()
        } else L()
    }

    function W(t, r) {
        (0, n.logFunctionStatus)("confirmDeleteSubject", !1), r.stopPropagation(), e.default.subjectToDelete = t, document.getElementById("delete-subject-msg").innerText = `\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0645\u062C\u0644\u062F "${t}"\u061F \u0633\u064A\u062A\u0645 \u0645\u0633\u062D \u062C\u0645\u064A\u0639 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0628\u062F\u0627\u062E\u0644\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B!`, document.getElementById("delete-subject-modal").classList.remove("hidden")
    }

    function _() {
        (0, n.logFunctionStatus)("closeDeleteModal", !1), e.default.subjectToDelete = null, document.getElementById("delete-subject-modal").classList.add("hidden")
    }
    async function X(t, r, o) {
        if ((0, n.logFunctionStatus)("executeDeleteSubject", !0), e.default.subjectToDelete) {
            console.log(`[deleteSubject] \u0628\u062F\u0621 \u062D\u0630\u0641 \u0627\u0644\u0645\u0627\u062F\u0629 \u2014 "${e.default.subjectToDelete}"`);
            try {
                const i = await (0, j.apiCall)("DELETE", "/api/quizzes/subject/" + encodeURIComponent(e.default.subjectToDelete));
                console.log(`[deleteSubject] \u2713 \u062A\u0645 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u2014 ${i.deletedCount||0} \u0627\u0645\u062A\u062D\u0627\u0646 \u0645\u062D\u0630\u0648\u0641`)
            } catch (i) {
                console.error("[deleteSubject] \u2717 \u0641\u0634\u0644:", i.message), (0, n.showAlert)("\u26A0\uFE0F \u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0645\u0627\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631: " + i.message, "warning")
            }
            e.default.allQuizzes = e.default.allQuizzes.filter(i => i.config.subject !== e.default.subjectToDelete), e.default.currentSubjectFilter === e.default.subjectToDelete && (e.default.currentSubjectFilter = "\u0627\u0644\u0643\u0644"), e.default.editSubjectFilter === e.default.subjectToDelete && (e.default.editSubjectFilter = "\u0627\u0644\u0643\u0644"), _(), t && t(), r && r(), o && o()
        }
    }
    window.deleteExamFromHistoryTree = function(t, r) {
        r.stopPropagation(), e.default.examToDelete = t, document.getElementById("delete-exam-msg").innerText = "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u061F \u0633\u064A\u062A\u0645 \u0645\u0633\u062D\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B!", document.getElementById("delete-exam-modal").classList.remove("hidden")
    };
    window.deleteNoteFromHistoryTree = function(t, r) {
        r.stopPropagation(), e.default.noteToDelete = t, document.getElementById("delete-exam-msg").innerText = "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0645\u0630\u0643\u0631\u0629\u061F \u0633\u064A\u062A\u0645 \u0645\u0633\u062D\u0647\u0627 \u0646\u0647\u0627\u0626\u064A\u0627\u064B!", document.getElementById("delete-exam-modal").classList.remove("hidden")
    };
    window.deleteExamFromEditTree = function(t, r) {
        r.stopPropagation(), e.default.examToDelete = t, e.default._lastDeleteContext = "edit", document.getElementById("delete-exam-msg").innerText = "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u061F \u0633\u064A\u062A\u0645 \u0645\u0633\u062D\u0647 \u0646\u0647\u0627\u0626\u064A\u0627\u064B!", document.getElementById("delete-exam-modal").classList.remove("hidden")
    };
    window.deleteNoteFromEditTree = function(t, r) {
        r.stopPropagation(), e.default.noteToDelete = t, e.default._lastDeleteContext = "edit", document.getElementById("delete-exam-msg").innerText = "\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0645\u0630\u0643\u0631\u0629\u061F \u0633\u064A\u062A\u0645 \u0645\u0633\u062D\u0647\u0627 \u0646\u0647\u0627\u0626\u064A\u0627\u064B!", document.getElementById("delete-exam-modal").classList.remove("hidden")
    };
    window.closeDeleteExamModal = function() {
        e.default.examToDelete = null, e.default.noteToDelete = null, document.getElementById("delete-exam-modal").classList.add("hidden")
    };
    window.confirmDeleteExamOrNote = async function() {
        if (e.default.examToDelete) {
            try {
                await (0, j.apiCall)("DELETE", "/api/quizzes/" + encodeURIComponent(e.default.examToDelete)), e.default.allQuizzes = e.default.allQuizzes.filter(t => t.config.id !== e.default.examToDelete), (0, n.showAlert)("\u2713 \u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646 \u0628\u0646\u062C\u0627\u062D", "success")
            } catch (t) {
                (0, n.showAlert)("\u26A0\uFE0F \u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646: " + t.message, "warning")
            }
            e.default.examToDelete = null
        }
        if (e.default.noteToDelete) {
            try {
                await (0, j.apiCall)("DELETE", "/api/notes/" + encodeURIComponent(e.default.noteToDelete)), e.default.allNotes = e.default.allNotes.filter(t => t.config.id !== e.default.noteToDelete), (0, n.showAlert)("\u2713 \u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0630\u0643\u0631\u0629 \u0628\u0646\u062C\u0627\u062D", "success")
            } catch (t) {
                (0, n.showAlert)("\u26A0\uFE0F \u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0645\u0630\u0643\u0631\u0629: " + t.message, "warning")
            }
            e.default.noteToDelete = null
        }
        document.getElementById("delete-exam-modal").classList.add("hidden"), typeof I == "function" && I(playQuiz, forceDownload);
        try {
            e.default._lastDeleteContext === "edit" && typeof k == "function" && k()
        } catch (t) {}
    };
})();