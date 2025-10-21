// ==UserScript==
// @name         yanmaga_comic_downloader
// @namespace
// @version      2025-06-12
// @description  狠狠下载
// @author       DHM
// @match        https://yanmaga.jp/viewer/comics/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const config = {
        selectors: {
            contentContainer: '#content',
            pageItem: '[id^="content-p"], [class*="page-content"]',
            comicImg: 'img[src^="blob:"], img[src^="https://sbc.yanmaga.jp/"]'
        },
        imgCheck: { minWidth: 300, minHeight: 400 },
        retry: { times: 3, interval: 1500 },
        styles: {
            container: `
                position:fixed; top:10px; right:10px; z-index:9999;
                background:#fff; border-radius:8px; box-shadow:0 3px 15px rgba(0,0,0,0.2);
                padding:15px; width:320px; max-height:600px; overflow-y:auto;
            `,
            title: `
                margin:0 0 15px; padding-bottom:8px; border-bottom:1px solid #eee;
                font-size:16px; color:#333; text-align:center;
            `,
            button: `
                background:#4CAF50; color:white; border:none; width:100%;
                padding:10px 0; font-size:14px; border-radius:4px;
                cursor:pointer; transition:all 0.3s; margin-bottom:10px;
            `,
            buttonHover: `background:#45a049; transform:translateY(-2px);`,
            status: `
                margin:10px 0; padding:8px; font-size:13px; color:#666;
                background:#f8f8f8; border-radius:4px; text-align:center;
            `,
            imgList: `
                display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;
                list-style:none; padding:0; margin:15px 0 0;
            `,
            imgItem: `
                border:1px solid #eee; border-radius:4px; overflow:hidden;
                position:relative; background:#f9f9f9; cursor:pointer;
                transition:transform 0.2s, box-shadow 0.2s;
            `,
            imgItemHover: `
                transform:scale(1.02); box-shadow:0 2px 8px rgba(0,0,0,0.15);
            `,
            thumbnail: `
                width:100%; height:100px; object-fit:contain;
                background:#f0f0f0;
            `,
            pageLabel: `
                position:absolute; bottom:3px; left:3px;
                background:rgba(0,0,0,0.6); color:white; font-size:11px;
                padding:1px 5px; border-radius:2px;
            `,
            previewOverlay: `
                position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(0,0,0,0.9); z-index:10000; display:flex;
                align-items:center; justify-content:center; padding:20px;
                box-sizing:border-box;
            `,
            previewImg: `
                max-width:90%; max-height:90vh; object-contain;
                box-shadow:0 0 20px rgba(0,0,0,0.3);
            `,
            closeBtn: `
                position:absolute; top:20px; right:20px;
                background:#fff; color:#000; border:none; border-radius:50%;
                width:36px; height:36px; font-size:20px; cursor:pointer;
                display:flex; align-items:center; justify-content:center;
                transition:background 0.2s;
            `,
            closeBtnHover: `
                background:#ff4444; color:white;
            `,
            pageInfo: `
                position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
                background:rgba(0,0,0,0.7); color:white; padding:5px 15px;
                border-radius:20px; font-size:14px;
            `
        }
    };

    let mangaCache = JSON.parse(localStorage.getItem('yanmagaCache') || '{}');
    let imgLoadStatus = new Map();
    let pageImgMap = new Map();
    let isScriptReady = false;
    let statusEl;
    let imgListEl;

    setTimeout(init, 1000);
    function init() {
        createControls();
        observeAllImgChanges();
        listenPageActions();
        clearCacheOnUnload();
        isScriptReady = true;
    }

    function observeAllImgChanges() {
        const container = document.querySelector(config.selectors.contentContainer) || document.body;
        const observer = new MutationObserver((mutations) => {
            if (!isScriptReady) return;
            mutations.forEach(mut => {
                const handleImg = (img) => {
                    if (img.matches?.(config.selectors.comicImg)) trackComicImg(img);
                };
                mut.addedNodes.forEach(node => {
                    if (node.tagName === 'IMG') handleImg(node);
                    else node.querySelectorAll('img').forEach(handleImg);
                });
                if (mut.target.tagName === 'IMG' && mut.attributeName === 'src') {
                    handleImg(mut.target);
                }
            });
        });
        observer.observe(container, {
            childList: true, attributes: true, attributeFilter: ['src'], subtree: true
        });
    }

    function trackComicImg(img) {
        const imgSrc = img.src;
        if (imgLoadStatus.has(imgSrc)) return;

        img.addEventListener('load', onImgLoad, { once: true, capture: true });
        img.addEventListener('error', onImgError, { once: true, capture: true });

        setTimeout(() => {
            if (!imgLoadStatus.has(imgSrc)) forceCheckImgStatus(img);
        }, 3000);

        imgLoadStatus.set(imgSrc, {
            status: 'loading',
            img: img,
            retryCount: 0,
            pageNum: getPageNumFromImg(img)
        });
    }

    function getPageNumFromImg(img) {
        let pageEl = img.closest(config.selectors.pageItem);
        if (!pageEl) {
            const urlMatch = window.location.href.match(/content-p(\d+)/);
            return urlMatch ? urlMatch[1] : `page_${Date.now().toString().slice(-4)}`;
        }
        const idMatch = pageEl.id.match(/content-p(\d+)/) || pageEl.id.match(/page-(\d+)/);
        return idMatch ? idMatch[1] : `page_${pageEl.dataset.page || Math.random().toString(36).slice(2,6)}`;
    }

    function onImgLoad(e) {
        const img = e.target;
        const imgSrc = img.src;
        const status = imgLoadStatus.get(imgSrc);
        if (!status) return;

        const valid = img.naturalWidth >= config.imgCheck.minWidth
                    && img.naturalHeight >= config.imgCheck.minHeight
                    && img.naturalWidth < 2000;

        if (valid) {
            status.status = 'ready';
            imgLoadStatus.set(imgSrc, status);
            updatePageImgMap(status.pageNum, img);
            cacheReadyPages();
        } else {
            status.status = 'invalid';
            imgLoadStatus.set(imgSrc, status);
        }
    }

    function forceCheckImgStatus(img) {
        const imgSrc = img.src;
        const status = imgLoadStatus.get(imgSrc);
        if (!status || status.status !== 'loading') return;

        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            img.dispatchEvent(new Event('load'));
        } else {
            status.retryCount += 1;
            if (status.retryCount < config.retry.times) {
                imgLoadStatus.set(imgSrc, status);
                setTimeout(() => {
                    img.src = imgSrc + `?t=${Date.now()}`;
                }, config.retry.interval * status.retryCount);
            } else {
                status.status = 'failed';
                imgLoadStatus.set(imgSrc, status);
            }
        }
    }

    function updatePageImgMap(pageNum, img) {
        if (!pageNum) pageNum = `temp_${Date.now().slice(-4)}`;
        if (!pageImgMap.has(pageNum)) pageImgMap.set(pageNum, []);

        const imgList = pageImgMap.get(pageNum);
        if (!imgList.some(i => i.src === img.src) && imgList.length < 3) {
            imgList.push(img);
            pageImgMap.set(pageNum, imgList);
            if (imgList.length === 3) setTimeout(cacheReadyPages, 500);
        }
        updateStatus();
        updateImageList();
    }

    function createControls() {
        const container = document.createElement('div');
        container.style.cssText = config.styles.container;

        const title = document.createElement('h3');
        title.style.cssText = config.styles.title;
        title.innerText = 'Yanmaga漫画下载器';
        container.appendChild(title);

        const downloadBtn = document.createElement('button');
        downloadBtn.innerText = '下载所有缓存页';
        downloadBtn.style.cssText = config.styles.button;
        downloadBtn.onmouseover = () => downloadBtn.style.background = config.styles.buttonHover;
        downloadBtn.onmouseout = () => downloadBtn.style.background = '';
        downloadBtn.onclick = batchDownload;
        container.appendChild(downloadBtn);

        statusEl = document.createElement('div');
        statusEl.style.cssText = config.styles.status;
        statusEl.innerText = '已缓存:0页';
        container.appendChild(statusEl);

        const listContainer = document.createElement('div');
        listContainer.innerHTML = '<strong style="font-size:13px;color:#555;">缓存预览(点击图片查看大图):</strong>';
        container.appendChild(listContainer);

        imgListEl = document.createElement('ul');
        imgListEl.style.cssText = config.styles.imgList;
        listContainer.appendChild(imgListEl);

        document.body.appendChild(container);
    }

    function updateImageList() {
        if (!imgListEl) return;
        imgListEl.innerHTML = '';

        const sortedPages = Object.entries(mangaCache)
            .sort((a, b) => parseInt(a[0].replace(/\D/g, '')) - parseInt(b[0].replace(/\D/g, '')));

        sortedPages.forEach(([pageNum, data], index) => {
            const li = document.createElement('li');
            li.style.cssText = config.styles.imgItem;

            li.onmouseover = () => {
                li.style.cssText = config.styles.imgItem + config.styles.imgItemHover;
            };
            li.onmouseout = () => {
                li.style.cssText = config.styles.imgItem;
            };

            const img = document.createElement('img');
            img.style.cssText = config.styles.thumbnail;
            img.src = data.dataUrl;
            img.alt = `第${pageNum}页`;
            li.appendChild(img);

            const label = document.createElement('div');
            label.style.cssText = config.styles.pageLabel;
            const fileName = `${(index + 1).toString().padStart(2, '0')}.jpg`;
            label.innerText = fileName;
            li.appendChild(label);

            li.addEventListener('click', () => {
                showPreview(data.dataUrl, pageNum, sortedPages, index + 1);
            });

            imgListEl.appendChild(li);
        });

        if (sortedPages.length === 0) {
            imgListEl.innerHTML = `
                <li style="grid-column: 1 / -1; text-align:center; padding:20px 0; color:#999; font-size:12px;">
                    暂无缓存内容,请翻页
                </li>
            `;
        }
    }

    function showPreview(imgUrl, pageNum, allPages, currentIndex) {
        const existingPreview = document.querySelector('.preview-overlay');
        if (existingPreview) existingPreview.remove();

        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        overlay.style.cssText = config.styles.previewOverlay;

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = config.styles.closeBtn;
        closeBtn.innerText = '×';
        closeBtn.onmouseover = () => closeBtn.style.cssText = config.styles.closeBtn + config.styles.closeBtnHover;
        closeBtn.onmouseout = () => closeBtn.style.cssText = config.styles.closeBtn;
        closeBtn.onclick = () => overlay.remove();

        const pageInfo = document.createElement('div');
        pageInfo.style.cssText = config.styles.pageInfo;
        const fileName = `${currentIndex.toString().padStart(2, '0')}.jpg`;
        pageInfo.innerText = `第${pageNum}页(共${allPages.length}页)|下载文件名:${fileName}`;

        const img = document.createElement('img');
        img.style.cssText = config.styles.previewImg;
        img.src = imgUrl;
        img.alt = `预览第${pageNum}页`;

        overlay.appendChild(closeBtn);
        overlay.appendChild(pageInfo);
        overlay.appendChild(img);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        document.body.appendChild(overlay);
    }

    function updateStatus() {
        const cachedPages = Object.keys(mangaCache).length;
        statusEl.innerText = `已缓存:${cachedPages}页`;
    }

    function onImgError(e) {
        const img = e.target;
        const imgSrc = img.src;
        const status = imgLoadStatus.get(imgSrc);
        if (!status) return;

        status.retryCount += 1;
        if (status.retryCount < config.retry.times) {
            imgLoadStatus.set(imgSrc, status);
            setTimeout(() => {
                img.src = imgSrc + `?t=${Date.now()}`;
            }, config.retry.interval * status.retryCount);
        } else {
            status.status = 'failed';
            imgLoadStatus.set(imgSrc, status);
        }
    }

    function cacheReadyPages() {
        pageImgMap.forEach((imgList, pageNum) => {
            if (mangaCache[pageNum] || imgList.length !== 3) return;

            const allReady = imgList.every(img => {
                const s = imgLoadStatus.get(img.src);
                return s && s.status === 'ready';
            });

            if (allReady) {
                stitchImages(imgList, pageNum)
                    .then(dataUrl => {
                        mangaCache[pageNum] = { dataUrl, time: Date.now() };
                        localStorage.setItem('yanmagaCache', JSON.stringify(mangaCache));
                        updateStatus();
                        updateImageList();
                    })
                    .catch(() => {});
            }
        });
    }

    function stitchImages(imgs, pageNum) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const sortedImgs = imgs.sort((a, b) => {
                    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
                });

                const totalWidth = sortedImgs[0].naturalWidth || 800;
                const totalHeight = sortedImgs.reduce((sum, img) => sum + (img.naturalHeight || 0), 0);
                canvas.width = totalWidth;
                canvas.height = totalHeight;

                let y = 0;
                sortedImgs.forEach(img => {
                    ctx.drawImage(img, 0, y, totalWidth, img.naturalHeight || 400);
                    y += img.naturalHeight || 400;
                });

                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                if (dataUrl.includes('data:image/jpeg')) resolve(dataUrl);
                else reject();
            } catch (err) {
                reject();
            }
        });
    }

    function batchDownload() {
        const sortedPages = Object.entries(mangaCache)
            .sort((a, b) => parseInt(a[0].replace(/\D/g, '')) - parseInt(b[0].replace(/\D/g, '')));

        if (sortedPages.length === 0) {
            statusEl.innerText = '无缓存页,请先翻页';
            setTimeout(updateStatus, 2000);
            return;
        }

        sortedPages.forEach(([pageNum, data], index) => {
            setTimeout(() => {
                const a = document.createElement('a');
                const fileName = `${(index + 1).toString().padStart(2, '0')}.jpg`;
                a.download = fileName;
                a.href = data.dataUrl;
                a.click();
                URL.revokeObjectURL(a.href);
            }, index * 500);
        });

        statusEl.innerText = `下载中(${sortedPages.length}页)`;
        setTimeout(updateStatus, 3000);
    }

    function listenPageActions() {
        window.addEventListener('scroll', debounce(() => {
            document.querySelectorAll(config.selectors.comicImg).forEach(img => trackComicImg(img));
        }, 500));
    }

    function clearCacheOnUnload() {
        window.addEventListener('beforeunload', () => {
            localStorage.removeItem('yanmagaCache');
        });
    }

    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
})();