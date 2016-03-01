#!/bin/bash


function get_branch_name() {

   git rev-parse --abbrev-ref HEAD
}


function get_git_log() {
    git log -1 --pretty=format:'%h - %s (%ci)'
}

function get_hash() {
    git rev-parse --verify HEAD
}


function get_iso_date() {
    date -u +"%Y-%m-%d %H:%M:%S %z"
}

function get_last_commit_date() {
    git log -1  --date=iso --pretty=format:%cd
}


if [ "$1" != "" ]; then
    VERSION=$1
else
    echo "Version is not set"
    exit 1
fi
if [ "$2" != "" ]; then
    API_URL=$2
else
    echo "API_URL is not set"
    exit 1
fi
if [ "$3" != "" ]; then
    GIT_BRANCH=$3
else
    echo "GIT_BRANCH is not set"
    exit 1
fi
if [ "$4" != "" ]; then
    USER_NAME=$4
else
    echo "USER_NAME is not set"
    exit 1
fi

printf '{\n  "branch":"%s",\n  "version": "%s",\n  "api_url": "%s",\n  "last_commit_hash":"%s",\n  "last_commit_date":"%s",\n  "user": "%s",\n  "build_date": "%s"\n}\n' "${GIT_BRANCH}" ${VERSION} ""${API_URL} "$(get_hash)" "$(get_last_commit_date)" "${USER_NAME}" "$(get_iso_date)" 

