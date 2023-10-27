#!/bin/sh
set -e

#   Switch to Dev Branch
git switch dev

#   Git Pull
git pull

#   Checkout Origin Dev Branch
#git checkout origin/dev

#   Switch to Atomic Patch Branch

GIT_DATE=$(date +'%m-%d-%Y-%s')

if [ "$#" -eq "0" ]; then
  PATCH_NAME="patch-atomic-${GIT_DATE}"
else
  UNFORMAT_PATCH="${1}"
  NEW_PATCH="${UNFORMAT_PATCH//[^[:alnum:]]/-}"
  PATCH_NAME="patch-atomic-${NEW_PATCH}-${GIT_DATE}"
fi

git switch -c "${PATCH_NAME}"


#   git switch -c "patch-atlas-${git_date}"