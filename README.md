# Yanmaga\_comic\_downloader

A userscript to download comic pages from yanmaga.jp viewer pages, with caching and preview features.

## Features

*   Auto-detects comic images on target pages
*   Caches valid images (filtered by size constraints)
*   Batch download of all cached pages
*   Thumbnail preview with large image view support
*   Persistent caching using localStorage

## Installation

1. Install a userscript manager (e.g., Tampermonkey, Greasemonkey)
2. Add this script to the manager
3. Navigate to any page matching: `https://yanmaga.jp/viewer/comics/*`

## Usage

A control panel appears at top-right. Click "下载所有缓存页" to download cached comic pages. Preview thumbnails by clicking them.

## Notes

*   Respects site's image loading mechanism with retry logic
*   Ensure compliance with yanmaga.jp's terms of service
*   Images are filtered by minimum dimensions (300x400px) to avoid invalid content
