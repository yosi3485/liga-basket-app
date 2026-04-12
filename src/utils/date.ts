export function formatDate(value: string): string {
    if (!value) return ''

    const date = new Date(`${value}T00:00:00`)

    return new Intl.DateTimeFormat('es-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(date)
}
