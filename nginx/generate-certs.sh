#!/bin/bash
# Генерация самоподписанного сертификата для локальной разработки

CERTS_DIR="$(dirname "$0")/certs"
mkdir -p "$CERTS_DIR"

# Генерируем приватный ключ и сертификат
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=DC-Scheduler/OU=Dev/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:calendar.local,IP:127.0.0.1"

echo "Сертификаты сгенерированы в $CERTS_DIR"
echo "  - server.key (приватный ключ)"
echo "  - server.crt (сертификат)"
echo ""
echo "Для доверия сертификату в браузере:"
echo "  macOS: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain $CERTS_DIR/server.crt"
echo "  или откройте https://localhost и добавьте исключение вручную"
