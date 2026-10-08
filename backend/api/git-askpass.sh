#!/bin/sh
case "$1" in *Username*|*username*) printf "%s\n" "x-access-token" ;; *) printf "%s\n" "$DIG_GIT_TOKEN" ;; esac
