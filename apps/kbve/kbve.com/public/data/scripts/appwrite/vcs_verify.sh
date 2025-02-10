#!/bin/sh

CODE='
if (openssl_pkey_get_private(getenv("_APP_VCS_GITHUB_PRIVATE_KEY")) === false) {
    echo "Invalid Private Key\n";
    exit(1);
} else {
    echo "Valid Private Key\n";
    exit(0);
}'

docker compose exec appwrite php -r "$CODE"

# 10/26/2023 -> APP_VCS Decoding
# docker container ls
# docker exec $(docker ps -q -f name=servicename) ls