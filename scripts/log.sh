triggered_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log_message() {
    printf '[triggeredAt=%s] %s\n' "$triggered_at" "$1"
}

log_format() {
    local message
    printf -v message "$@"
    log_message "$message"
}
