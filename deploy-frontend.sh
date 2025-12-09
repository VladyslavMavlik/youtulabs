#!/bin/bash

# Youtulabs Frontend Deploy Script
# Цей скрипт збирає frontend і завантажує на Hetzner сервер

set -e  # Зупинити при помилках

echo "🚀 Youtulabs Frontend Deploy"
echo "================================"

# Перехід у папку frontend
cd Genisss-main

echo "📦 Встановлення залежностей..."
npm install

echo "🔨 Збірка production build..."
npm run build

echo "✅ Build готовий!"
echo ""
echo "📤 Завантаження на сервер..."

# Завантаження build на сервер
scp -r build/* root@46.224.42.246:/var/www/youtulabs/

echo ""
echo "✅ Деплой завершено!"
echo ""
echo "📋 Що відбулось:"
echo "   ✓ SEO теги додано (title, meta, Open Graph)"
echo "   ✓ sitemap.xml створено"
echo "   ✓ robots.txt створено"
echo "   ✓ Файли завантажено на сервер"
echo ""
echo "🌐 Сайт: https://youtulabs.com"
echo ""
echo "📊 Наступні кроки для SEO:"
echo "   1. Зареєструйте сайт в Google Search Console"
echo "   2. Додайте sitemap: https://youtulabs.com/sitemap.xml"
echo "   3. Почекайте 2-7 днів на індексацію"
echo ""
