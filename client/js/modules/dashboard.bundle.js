(()=>{var E={currentQuizData:null,currentSubjectFilter:"\u0627\u0644\u0643\u0644",allQuizzes:[],editSubjectFilter:"\u0627\u0644\u0643\u0644",allUserScores:[],currentViewMode:null,currentUser:null,allNotes:[],editTabMode:"exams",editingNoteIndex:-1,currentQuestionIndex:0,score:0,subjectToDelete:null,streak:0,timerInterval:null,timeRemaining:0,userAnswers:[],totalQuestions:0,serverLeaderboard:[],serverScores:[],quizStarted:!1,isEditMode:!1,isAdmin:!1,dataLoaded:!1,timerStartTime:0,timerTotalSeconds:0,googleLoginMode:"student",gsiRetries:0,quizDraft:null,bCurrentQIndex:0,subjectToRename:null,tokenRefreshTimer:null,GOOGLE_CLIENT_ID:"124349544803-hr3h69k1uhi78aamk8iacj9e1rjpjsgf.apps.googleusercontent.com",quizAttempts:{}};var e=E;function m(t){return t?String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}function y(t,r=!1){try{let o=typeof navigator<"u"?navigator.onLine:!0;console.log(`[FUNC] ${t} \u2014 online:${o} serverBound:${r}`)}catch{}}function N(){try{return document.cookie.split(";").map(t=>t.trim()).find(t=>t.startsWith("csrf_token="))?.split("=")[1]||""}catch{return""}}function k(){let t={"Content-Type":"application/json"},r=N();return r&&(t["X-CSRF-Token"]=r),t}async function S(t,r,o){y(`apiCall ${t} ${r}`,!0);let i=`[API] ${t} ${r}`;console.log(`${i} \u2014 \u0625\u0631\u0633\u0627\u0644...`,o??"");let c={method:t,headers:k(),credentials:"include"};o&&(c.body=JSON.stringify(o));let u=await fetch(r,c);if(!u.ok){let b=await u.json().catch(()=>({})),h=b.error||`HTTP ${u.status}`;throw console.error(`${i} \u2717 \u0641\u0634\u0644 \u2014 ${u.status}:`,b),new Error(h)}let p=await u.json();return console.log(`${i} \u2713 \u0646\u062C\u062D \u2014 ${u.status}`,p),p}function B(){let t="dashboard-refresh-btn",r=document.getElementById(t);if(!r){r=document.createElement("button"),r.id=t,r.className="absolute top-2 right-2 px-4 py-2 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 z-20",r.innerHTML='<i class="fas fa-sync-alt"></i> \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A',r.onclick=async()=>{r.disabled=!0,r.innerHTML='<i class="fas fa-spinner fa-spin"></i> \u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u062F\u064A\u062B...',await window.forceDashboardRefresh(),r.disabled=!1,r.innerHTML='<i class="fas fa-sync-alt"></i> \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A'};let o=document.getElementById("dashboard-view");o&&o.appendChild(r)}}window.forceDashboardRefresh=async function(){typeof loadDataFromServer=="function"&&(await loadDataFromServer(),typeof w=="function"&&w(!0))};var g=null;function R(){g&&clearInterval(g),g=setInterval(()=>{typeof w=="function"&&w(!0)},6e4)}function q(){g&&(clearInterval(g),g=null)}async function C(t,r=!1){if(e.attemptsMap||(e.attemptsMap=new Map),!r&&t.every(i=>e.attemptsMap.has(String(i.id)))&&e.attemptsMap.size>0)return console.log("[dashboard] \u2713 attemptsMap \u0645\u0646 \u0627\u0644\u0643\u0627\u0634 \u2014 \u0644\u0627 \u0637\u0644\u0628 \u0645\u064F\u0631\u0633\u064E\u0644"),e.attemptsMap;console.log("[dashboard] \u2190 \u062C\u0644\u0628 /api/scores/my/attempts (\u0637\u0644\u0628 \u0648\u0627\u062D\u062F)...");try{let o=await S("GET","/api/scores/my/attempts");if(!Array.isArray(o))throw new TypeError(`\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639\u0629 \u0645\u0646 \u0627\u0644\u0633\u064A\u0631\u0641\u0631: ${JSON.stringify(o)}`);o.forEach(i=>{i?.quizId!=null&&e.attemptsMap.set(String(i.quizId),Number(i.attemptCount)||0)}),t.forEach(i=>{let c=String(i.id);e.attemptsMap.has(c)||e.attemptsMap.set(c,0)}),console.log(`[dashboard] \u2713 attemptsMap \u062C\u0627\u0647\u0632\u0629 \u2014 ${e.attemptsMap.size} \u0627\u062E\u062A\u0628\u0627\u0631`)}catch(o){console.warn("[dashboard] \u26A0\uFE0F \u062A\u0639\u0630\u0631 \u062C\u0644\u0628 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u2014 \u0633\u064A\u064F\u0639\u0631\u0636 fallback \u0646\u0635\u064A:",o.message),t.forEach(i=>{let c=String(i.id);e.attemptsMap.has(c)||e.attemptsMap.set(c,null)}),e.attemptsFetchError=!0}return e.attemptsMap}function L(t,r){return r==null||r<=0?!1:t>=r}function D(t,r){return t===null?`
            <div class="mt-3 pt-3 border-t border-gray-100 relative z-10">
                <div class="flex items-center gap-2 text-xs text-gray-400 italic">
                    <i class="fas fa-exclamation-circle text-amber-400 shrink-0"></i>
                    <span>\u0644\u0645 \u064A\u062A\u0645\u0643\u0646 \u0645\u0646 \u062C\u0644\u0628 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A</span>
                </div>
            </div>`:`
        <div class="mt-3 pt-3 border-t border-gray-100 relative z-10">
            <div class="flex items-center gap-2 text-xs text-gray-500">
                <i class="fas fa-redo-alt text-blue-400 shrink-0"></i>
                <span>\u0639\u062F\u062F \u0645\u0631\u0627\u062A \u062D\u0644\u0651\u0643 \u0644\u0647\u0630\u0627 \u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646: ${t===0?'<span class="text-gray-400 font-semibold">\u0644\u0645 \u062A\u062D\u0627\u0648\u0644 \u0628\u0639\u062F</span>':`<span class="font-black text-blue-600 text-sm">${t}</span>`}</span>
            </div>
            ${r?`<div class="mt-2 flex items-center gap-2 text-xs font-bold
                       bg-amber-50 text-amber-700 border border-amber-200
                       rounded-xl px-3 py-2">
               <i class="fas fa-graduation-cap shrink-0"></i>
               <span>\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0627\u0644\u0642\u0627\u062F\u0645\u0629 \u0633\u062A\u064F\u0633\u062C\u064E\u0651\u0644 \u0643\u062A\u062F\u0631\u064A\u0628\u064A\u0629</span>
           </div>`:""}
        </div>`}async function G(t,r){y("deleteQuiz",!0);let o=e.allQuizzes[t];if(!o){showAlert("\u26A0\uFE0F \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");return}if(await showConfirm("\u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631","\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u061F \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639.","\u{1F5D1}\uFE0F"))try{await S("DELETE",`/api/quizzes/${o.id}`),e.allQuizzes.splice(t,1),typeof r=="function"&&r(!0),showToastMessage("\u2705 \u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631.",2e3)}catch(c){console.error("[deleteQuiz] \u2717",c.message),showAlert("\u26A0\uFE0F \u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631: "+c.message,"warning")}}async function w(t=!1){if(y("renderDashboard",!1),!e.dataLoaded){console.log("[dashboard] \u23F3 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0645 \u062A\u064F\u062D\u0645\u0651\u0644 \u0628\u0639\u062F...");let a=`
            <div class="col-span-full py-12 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                <p class="font-medium">\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A...</p>
            </div>`;document.getElementById("latest-exams-grid")?.replaceChildren(),document.getElementById("latest-notes-grid")?.replaceChildren(),document.getElementById("leaderboard-list")?.replaceChildren(),document.getElementById("latest-exams-grid").innerHTML=a,document.getElementById("latest-notes-grid").innerHTML=a,document.getElementById("leaderboard-list").innerHTML=a;return}let o=[...e.allQuizzes].sort((a,s)=>{let n=new Date(a.config.createdAt||a.createdAt||0);return new Date(s.config.createdAt||s.createdAt||0)-n}).slice(0,4),i=e.maxOfficialAttempts??null,c=new Map;e.currentUser&&o.length>0&&(e.attemptsFetchError=!1,c=await C(o,t));let u=document.getElementById("latest-exams-grid");if(u.innerHTML="",o.length===0)u.innerHTML=`
        <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                    border-gray-200 text-center text-gray-400 font-medium">
            \u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0645\u0636\u0627\u0641\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646.
        </div>`;else{let a="";o.forEach((s,n)=>{let l=e.allQuizzes.length-1-n,d=m(s.config.title),f=m(s.config.description||""),x=m(s.config.subject||"\u0639\u0627\u0645"),v=s.config.maxOfficialAttempts??i,M=c.get(String(s.id))??0,A=e.currentUser&&M!==null?L(M,v):!1;a+=`
            <div class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                        cursor-pointer border border-gray-100 hover:border-blue-400 group
                        relative overflow-hidden flex flex-col">
                <div onclick="playQuiz(${l})" class="h-full w-full">

                    <div class="absolute -left-6 -top-6 w-24 h-24 exam-card-hover-glow rounded-full
                            opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600
                                    rounded-2xl flex items-center justify-center text-2xl shadow-inner
                                    group-hover:scale-110 transition duration-300">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <span class="time-badge-anim text-xs bg-blue-50 text-blue-600 px-3 py-1.5
                                     rounded-lg font-bold flex items-center gap-1">
                            <i class="far fa-clock"></i> ${s.config.timeLimit/60} \u062F\u0642\u064A\u0642\u0629
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${d}
                    </h3>

                    ${s.config.description?`<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${f}</p>`:'<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[120px]">${x}</span>
                        <span class="text-xs text-gray-500 font-bold bg-gray-50 px-2.5 py-1.5
                                     rounded-md">${s.questions.length} \u0623\u0633\u0626\u0644\u0629</span>
                    </div>

                    ${e.currentUser?D(M,A):""}
                </div>
            </div>`}),u.innerHTML=a}let p=document.getElementById("latest-notes-grid");p.innerHTML="";let b=e.allNotes.slice(-3).reverse();if(b.length===0)p.innerHTML=`
            <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                        border-gray-200 text-center text-gray-400 font-medium">
                \u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0630\u0643\u0631\u0627\u062A \u0623\u0648 \u0645\u0644\u0641\u0627\u062A \u0645\u0636\u0627\u0641\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646.
            </div>`;else{let a="";b.forEach(s=>{let{config:n}=s,l=n.type==="ppt"?"fa-file-powerpoint text-red-500":"fa-file-pdf text-orange-500",d=n.type==="ppt"?"from-red-50 to-red-100":"from-orange-50 to-orange-100",f=m(n.title),x=m(n.description||""),v=m(n.subject||"\u0639\u0627\u0645");a+=`
                <div onclick="forceDownload('${m(n.link)}')"
                     class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            cursor-pointer border border-gray-100 hover:border-orange-400 group
                            relative overflow-hidden">

                    <div class="absolute -left-6 -top-6 w-24 h-24 notes-card-hover-glow rounded-full
                                opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br ${d} rounded-2xl flex items-center
                                    justify-center text-3xl shadow-inner group-hover:scale-110
                                    transition duration-300">
                            <i class="fas ${l}"></i>
                        </div>
                        <span class="text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg
                                     font-bold flex items-center gap-1 group-hover:bg-orange-600
                                     group-hover:text-white transition">
                            <i class="fas fa-download"></i> \u062A\u062D\u0645\u064A\u0644 \u0645\u0628\u0627\u0634\u0631
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${f}
                    </h3>

                    ${n.description?`<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${x}</p>`:'<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-orange-50 text-orange-800 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[150px]">${v}</span>
                        <span class="text-xs text-gray-400 font-medium flex items-center gap-1">
                            <i class="fas fa-link"></i>
                            ${m((n.type||"pdf").toUpperCase())}
                        </span>
                    </div>
                </div>`}),p.innerHTML=a}let h=document.getElementById("leaderboard-list");h.innerHTML="";let $=e.allQuizzes.length||1,z=Array.isArray(e.serverLeaderboard)&&e.serverLeaderboard.length>0?e.serverLeaderboard:(()=>{let a={};return(e.serverScores?.length>0?e.serverScores:e.allUserScores).forEach(n=>{if(n.isOfficial===!1)return;let l=n.userName||"\u0637\u0627\u0644\u0628",d=Number(n.total)||0,f=Number(n.score)||0;d<=0||(a[l]||(a[l]={userName:l,totalScore:0,totalMax:0,examsCount:0,fullMarksCount:0}),a[l].totalScore+=f,a[l].totalMax+=d,a[l].examsCount+=1,f===d&&(a[l].fullMarksCount+=1))}),Object.values(a).map(n=>({...n,avgPercentage:n.totalMax>0?Math.round(n.totalScore/n.totalMax*100):0}))})(),T=z.filter(a=>a.totalScore>0).sort((a,s)=>s.fullMarksCount!==a.fullMarksCount?s.fullMarksCount-a.fullMarksCount:s.avgPercentage!==a.avgPercentage?s.avgPercentage-a.avgPercentage:s.totalScore!==a.totalScore?s.totalScore-a.totalScore:String(a.userName).localeCompare(String(s.userName),"ar"));if(T.length===0)h.innerHTML=`
            <div class="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">
                \u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0645\u0633\u062C\u0644\u0629 \u0628\u0639\u062F.
            </div>`;else{let a=["\u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u0623\u0648\u0644","\u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u062B\u0627\u0646\u064A","\u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u062B\u0627\u0644\u062B"],s=["bg-gradient-to-l from-yellow-50 to-white border-yellow-200 text-yellow-700","bg-gradient-to-l from-gray-50 to-white border-gray-200 text-gray-600","bg-gradient-to-l from-orange-50 to-white border-orange-200 text-orange-700"],n=["\u{1F947}","\u{1F948}","\u{1F949}"],l="";T.slice(0,3).forEach((d,f)=>{let x=m(d.userName),v=d.fullMarksCount>0?`\u{1F31F} ${d.fullMarksCount}/${$} \u062F\u0631\u062C\u0629 \u0646\u0647\u0627\u0626\u064A\u0629`:`${d.examsCount}/${$} \u0627\u0645\u062A\u062D\u0627\u0646`;l+=`
                <div class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            border ${s[f]||s[2]} flex items-center gap-4 mb-3">
                    <span class="text-2xl">${n[f]||"\u{1F3C5}"}</span>
                    <div class="flex-1">
                        <div class="font-extrabold text-lg">${x}</div>
                        <div class="text-xs font-bold text-gray-500">${a[f]||"\u0645\u062A\u0645\u064A\u0632"} \u2022 ${v}</div>
                    </div>
                </div>`}),h.innerHTML=l}console.log(`[dashboard] \u2713 \u062A\u0645 \u0631\u0633\u0645 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u2014 ${e.allQuizzes.length} \u0627\u0645\u062A\u062D\u0627\u0646\u060C ${e.allNotes.length} \u0645\u0630\u0643\u0631\u0629\u060C ${z.length} \u0641\u064A \u0627\u0644\u0634\u0631\u0641`)}})();
