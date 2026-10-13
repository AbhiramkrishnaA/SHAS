# SAHS website backend

This site runs as a small Node.js server. The homepage is a short landing page, with About & Leadership (`about.html`), Our Work (`work.html`), Blogs (`blogs.html`), Gallery and Tenders on separate pages. The CCP signs in through a server API, image and tender PDF files are saved under `uploads/`, and published records, blogs and the homepage notification are saved in `data/content.json`.

## Run locally

Install Node.js 22.9 or newer, then from this folder run:

```powershell
npm start
```

Open `http://localhost:3000/` for the website and `http://localhost:3000/CCP/` for the control panel. In CCP, administrators can edit the homepage notification and create, edit or remove blog posts, alongside managing gallery images and tenders. The local `.env` file contains the initial credentials. Change its password and session secret before exposing the site publicly.

## Deploy

Deploy this folder to a Node.js host that supports a persistent disk. Set `CCP_USERNAME`, `CCP_PASSWORD`, `SESSION_SECRET`, and `PORT` as host environment variables, then run `npm start`. Keep the `data/` and `uploads/` directories on persistent storage; otherwise records and files can be lost when the host restarts or redeploys. Keep `.env` private and do not commit it.

Uploads are limited to 25 MB per image and 35 MB per PDF. Accepted image types are JPEG, PNG, WebP and GIF.
