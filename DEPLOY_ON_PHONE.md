# LOVE TIME — نسخه آسان برای آپلود با گوشی

این نسخه عمداً همه فایل‌های لازم را در ریشه پروژه قرار داده است تا آپلود در GitHub از طریق گوشی ساده‌تر باشد.

فایل‌های اصلی:
- package.json
- server.js
- db.js
- index.html
- render.yaml
- README.md
- DEPLOY_ON_PHONE.md

در GitHub از مسیر Add file → Upload files همه این فایل‌ها را انتخاب کنید و سپس Commit changes را بزنید.

بعد در Render:
- New → Web Service
- Repository: love-time-store
- Build Command: npm install
- Start Command: npm start
- Health Check Path: /api/health

این نسخه برای دمو و ارائه مناسب است. برای فروش واقعی، دیتابیس پایدار و درگاه پرداخت واقعی باید جداگانه پیکربندی شوند.
