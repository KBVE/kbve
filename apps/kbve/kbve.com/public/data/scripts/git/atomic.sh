#!/bin/bash
set -e

git switch dev

git pull

GIT_DATE=$(date +'%m-%d-%Y-%s')

if [ "$#" -eq "0" ]; then
  PATCH_NAME="patch-atomic-${GIT_DATE}"
else
  UNFORMAT_PATCH=$(echo "$@" | tr ' ' '-')
  NEW_PATCH="${UNFORMAT_PATCH//[^[:alnum:]-]/-}"
  NEW_PATCH="${NEW_PATCH,,}"
  PATCH_NAME="patch-atomic-${NEW_PATCH}-${GIT_DATE}"
fi

git switch -c "${PATCH_NAME}"