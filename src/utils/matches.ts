import { formatDate } from './date'

export type MatchLabelItem = {
    id: string
    played_at: string
    created_at?: string
}

export function getMatchLabel(
    match: MatchLabelItem,
    matches: MatchLabelItem[]
): string {
    const sameDayMatches = matches
        .filter((item) => item.played_at === match.played_at)
        .sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
            return aTime - bTime
        })

    const index = sameDayMatches.findIndex((item) => item.id === match.id)

    if (sameDayMatches.length <= 1) {
        return formatDate(match.played_at)
    }

    return `${formatDate(match.played_at)} · Partido ${index + 1}`
}
