export function formatDate(date: string) {
    const [year, month, day] = date.split('-').map(Number)
    const d = new Date(year, month - 1, day)

    const monthName = d.toLocaleDateString('es-ES', { month: 'long' })
    const capitalizedMonth =
        monthName.charAt(0).toUpperCase() + monthName.slice(1)

    return `${capitalizedMonth} ${day}, ${year}`
}
