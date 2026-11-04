// utils/linkPreview.js
// Builds a REAL link preview (title, description, thumbnail) for a URL, so a status that contains a link shows the
// page / group card instead of a bare "Link Preview" placeholder. Never throws: on any failure the status is still
// posted, just with whatever could be gathered (at worst the site name).
const axios = require('axios');

const UA = 'WhatsApp/2.24.6.77 A';                       // sites that serve preview tags to WhatsApp's own fetcher do so for this UA
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

const decodeEntities = (s) => String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));

function metaTag(html, names) {
    for (const n of names) {
        const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i');
        const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
        const m = html.match(re1) || html.match(re2);
        if (m && m[1]) return decodeEntities(m[1]).trim();
    }
    return '';
}

async function fetchImage(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 4 * 1024 * 1024, maxRedirects: 3, headers: { 'User-Agent': UA } });
    return Buffer.from(res.data);
}

async function toThumb(buf) {
    try {
        const sharp = require('sharp');
        return await sharp(buf).resize(300, 300, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
    } catch { return null; }
}

async function pageMeta(url) {
    const res = await axios.get(url, { timeout: 8000, maxContentLength: 2 * 1024 * 1024, maxRedirects: 3, responseType: 'text', headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, validateStatus: (s) => s < 400 });
    const html = String(res.data || '').slice(0, 400000);
    const title = metaTag(html, ['og:title', 'twitter:title']) || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim();
    let image = metaTag(html, ['og:image', 'twitter:image']);
    if (image) { try { image = new URL(image, url).href; } catch { image = ''; } }
    return { title, description: metaTag(html, ['og:description', 'twitter:description', 'description']), image };
}

async function fill(sock, ext, rawUrl) {
    const url = String(rawUrl || '').replace(/[)\].,;!?]+$/, '');
    ext.matchedText = url;
    ext.canonicalUrl = url;
    ext.previewType = 0;
    let host = '';
    try { host = new URL(url).hostname; } catch { return ext; }
    ext.title = host;
    if (!/^https?:$/i.test(new URL(url).protocol) || PRIVATE_HOST.test(host)) return ext;

    let title = '', description = '', image = '', groupJid = null;
    try {
        const invite = url.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/i);
        if (invite && sock && typeof sock.groupGetInviteInfo === 'function') {
            try {
                const info = await sock.groupGetInviteInfo(invite[1]);
                title = info.subject || '';
                description = info.desc || (info.size ? `${info.size} members` : '') || 'WhatsApp Group Invite';
                groupJid = info.id ? (String(info.id).includes('@') ? info.id : info.id + '@g.us') : null;
            } catch { /* expired link or not allowed: fall back to the page tags */ }
        }
        let thumb = null;
        if (groupJid) {
            try { const pic = await sock.profilePictureUrl(groupJid, 'image'); if (pic) thumb = await toThumb(await fetchImage(pic)); } catch { /* not visible to non-members */ }
        }
        if (!title || !thumb) {
            try {
                const pm = await pageMeta(url);
                title = title || pm.title; description = description || pm.description; image = pm.image;
                if (!thumb && image) { try { thumb = await toThumb(await fetchImage(image)); } catch { /* no image */ } }
            } catch { /* page unreachable */ }
        }
        if (title) ext.title = title.slice(0, 200);
        if (description) ext.description = description.slice(0, 300);
        if (thumb) ext.jpegThumbnail = thumb;
    } catch { /* keep the minimal preview */ }
    return ext;
}

module.exports = { fill };
