#!/bin/bash
set -e

git switch dev

git pull

GIT_DATE=$(date +'%m-%d-%Y-%s')

if [ "$#" -eq "0" ]; then
  PATCH_NAME="patch-atomic-${GIT_DATE}"
else
  UNFORMAT_PATCH="${1}"
  NEW_PATCH=$(echo "$UNFORMAT_PATCH" | sed 's/[^[:alnum:]]/-/g')
  PATCH_NAME="patch-atomic-${NEW_PATCH}-${GIT_DATE}"
fi

git switch -c "${PATCH_NAME}"