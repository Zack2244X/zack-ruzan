/**
 * @module notes
 * @description وحدة المذكرات — إضافة، تعديل، تحميل الملفات والمذكرات
 */
import state from './state.js';
import { escapeHtml, showAlert } from './helpers.js';
import { apiCall } from './api.js';
import { _showThemeToggle } from './navigation.js';

/**
 * فتح مودل إضافة مذكرة جديدة — تصفير الحقول
 */
export function openAddNoteModal() {
    _showThemeToggle(false);
    document.getElementById('new-n-title').value = '';
    document.getElementById('new-n-subject').value = '';
    document.getElementById('new-n-link').value = '';
    document.getElementById('new-n-desc').value = '';
    document.getElementById('add-note-modal').classList.remove('hidden');
}

/**
 * إغلاق مودل إضافة/تعديل المذكرة — إعادة زر الحفظ لشكله الأصلي
 */
export function closeAddNoteModal() {
    _showThemeToggle(true);
    document.getElementById('add-note-modal').classList.add('hidden');
    const saveBtn = document.getElementById('save-note-btn');
    if (saveBtn) {
        saveBtn.setAttribute('onclick', 'saveNote()');
        saveBtn.innerHTML = '<i class="fas fa-save ml-2"></i> حفظ في السجل';
    }
    state.editingNoteIndex = -1;
}

/**
 * حفظ مذكرة جديدة على السيرفر وإضافتها للمصفوفة المحلية
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} renderSubjectFilters — دالة رسم الفلاتر
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} navToSectionFn — دالة الانتقال لقسم المذكرات
 */
export async function saveNote(renderEditTree, renderSubjectFilters, renderHistoryTree, navToSectionFn) {
    const title = document.getElementById('new-n-title').value.trim();
    const subject = document.getElementById('new-n-subject').value.trim();
    const link = document.getElementById('new-n-link').value.trim();

    if (!title || !subject || !link) {
        showAlert('⚠️ يرجى تعبئة العنوان والمادة والرابط!', 'warning');
        return;
    }

    const noteData = {
        title,
        subject,
        link,
        type: document.getElementById('new-n-type').value,
        description: document.getElementById('new-n-desc').value.trim()
    };

    console.log(`[saveNote] بدء حفظ المذكرة — العنوان: "${title}"`);
    try {
        const saved = await apiCall('POST', '/api/notes', noteData);
        const serverId = saved.note?.id || saved.id;
        const newNote = {
            id: serverId,
            config: {
                id: serverId,
                title,
                subject,
                link,
                type: noteData.type,
                description: noteData.description
            }
        };
        state.allNotes.push(newNote);
        console.log(`[saveNote] ✓ تم الحفظ على السيرفر — ID: ${serverId}`);
        showAlert('✅ تم إضافة الملف بنجاح!');
    } catch (e) {
        console.error(`[saveNote] ✗ فشل الحفظ:`, e.message);
        const newNote = {
            config: {
                id: 'note-' + Date.now(),
                title,
                subject,
                link,
                type: noteData.type,
                description: noteData.description
            }
        };
        state.allNotes.push(newNote);
        showAlert('⚠️ تعذر الحفظ على السيرفر: ' + e.message, 'warning');
    }
    closeAddNoteModal();
    if (renderEditTree) renderEditTree();

    if (state.currentViewMode !== 'notes' && navToSectionFn) {
        navToSectionFn('notes');
    } else {
        if (renderSubjectFilters) renderSubjectFilters();
        if (renderHistoryTree) renderHistoryTree();
        if (renderEditTree) renderEditTree();
    }
}

/**
 * تحميل بيانات مذكرة موجودة في حقول التعديل
 * @param {number} index — فهرس المذكرة في allNotes
 */
export function loadNoteIntoBuilder(index) {
    document.getElementById('edit-selection-modal').classList.add('hidden');

    const noteData = state.allNotes[index].config;
    state.editingNoteIndex = index;

    document.getElementById('new-n-title').value = noteData.title;
    document.getElementById('new-n-subject').value = noteData.subject || '';
    document.getElementById('new-n-link').value = noteData.link;
    document.getElementById('new-n-desc').value = noteData.description || '';
    document.getElementById('new-n-type').value = noteData.type || 'pdf';

    const saveBtn = document.getElementById('save-note-btn');
    saveBtn.setAttribute('onclick', 'updateExistingNote()');
    saveBtn.innerHTML = '<i class="fas fa-sync ml-2"></i> تحديث المذكرة';

    document.getElementById('add-note-modal').classList.remove('hidden');
}

/**
 * تحديث مذكرة موجودة على السيرفر والمصفوفة المحلية
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} renderDashboard — دالة رسم لوحة التحكم
 */
export async function updateExistingNote(renderHistoryTree, renderEditTree, renderDashboard) {
    const title = document.getElementById('new-n-title').value.trim();
    const subject = document.getElementById('new-n-subject').value.trim();
    const link = document.getElementById('new-n-link').value.trim();

    if (!title || !subject || !link) {
        showAlert('⚠️ يرجى تعبئة العنوان والمادة والرابط!', 'warning');
        return;
    }

    const noteId = state.allNotes[state.editingNoteIndex].id || state.allNotes[state.editingNoteIndex].config?.id;
    const noteUpdateData = {
        title,
        subject,
        link,
        type: document.getElementById('new-n-type').value,
        description: document.getElementById('new-n-desc').value.trim()
    };

    console.log(`[updateNote] بدء تحديث المذكرة — ID: ${noteId}, العنوان: "${title}"`);
    try {
        await apiCall('PUT', '/api/notes/' + noteId, noteUpdateData);
        console.log(`[updateNote] ✓ تم التحديث على السيرفر — ID: ${noteId}`);
        showAlert('✅ تم تحديث المذكرة بنجاح!');
    } catch (e) {
        console.error(`[updateNote] ✗ فشل التحديث:`, e.message);
        showAlert('⚠️ تعذر التحديث على السيرفر: ' + e.message, 'warning');
    }

    state.allNotes[state.editingNoteIndex].config.title = title;
    state.allNotes[state.editingNoteIndex].config.subject = subject;
    state.allNotes[state.editingNoteIndex].config.link = link;
    state.allNotes[state.editingNoteIndex].config.description = document.getElementById('new-n-desc').value.trim();
    state.allNotes[state.editingNoteIndex].config.type = document.getElementById('new-n-type').value;

    closeAddNoteModal();
    if (renderHistoryTree) renderHistoryTree();
    if (renderEditTree) renderEditTree();
    if (renderDashboard) renderDashboard();
}

/**
 * تحميل ملف من Google Drive أو SharePoint أو OneDrive بتحويل الرابط للتحميل المباشر
 * يتحقق من أن الرابط آمن (يبدأ بـ http/https فقط) لمنع XSS
 * @param {string} url — رابط الملف الأصلي
 */
export function forceDownload(url) {
    console.log(`[forceDownload] بدء تحميل —`, url);
    // التحقق من أن الرابط آمن — منع javascript: و data: و vbscript:
    const lowerUrl = (url || '').trim().toLowerCase();
    if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
        showAlert('⚠️ رابط غير آمن. يجب أن يبدأ بـ https://', 'warning');
        return;
    }

    let finalUrl = url;

    try {
        // 1. Google Drive
        if (url.includes('drive.google.com/file/d/')) {
            const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                finalUrl = 'https://drive.google.com/uc?export=download&id=' + match[1];
            }
        }
        // 2. SharePoint / OneDrive الجامعي أو العملي
        else if (url.includes('sharepoint.com')) {
            const spMatch = url.match(
                /^(https:\/\/[^\/]+)\/:.:\/.+?\/((?:personal|sites)\/[^\/]+)\/([^?\/]+)/
            );

            if (spMatch) {
                const origin = spMatch[1];
                const sitePath = spMatch[2];
                const shareId = spMatch[3];
                finalUrl = origin + '/' + sitePath + '/_layouts/15/download.aspx?share=' + shareId;
            } else if (url.includes('/Documents/')) {
                const siteRoot = url.match(/^(https:\/\/[^\/]+\/(?:sites|personal)\/[^\/]+)/);
                if (siteRoot) {
                    const filePath = url.split('?')[0];
                    finalUrl = siteRoot[1] + '/_layouts/15/download.aspx?SourceUrl=' + encodeURIComponent(filePath);
                }
            } else {
                finalUrl = url.includes('?') ? url + '&download=1' : url + '?download=1';
            }
        }
        // 3. OneDrive الشخصي
        else if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
            finalUrl = url.includes('?') ? url + '&download=1' : url + '?download=1';
        }

        window.location.href = finalUrl;
    } catch (error) {
        window.open(url, '_blank');
    }
}
