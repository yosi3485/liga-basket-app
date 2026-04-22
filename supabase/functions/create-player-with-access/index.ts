import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'supabase'

type CreatePlayerWithAccessPayload = {
    playerName: string
    teamId: string
    jerseyNumber?: number | null
    phone?: string | null
    email?: string | null
    password: string
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response('ok', {
                headers: corsHeaders
            })
        }
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                status: 401,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        })

        const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

        const {
            data: { user },
            error: userError
        } = await userClient.auth.getUser()

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        // Aquí puedes endurecer esto luego con un claim/rol real.
        // Por ahora, si quieres restringir por emails admins conocidos, usa algo así:
        const allowedAdminEmails = new Set([
            'yosi3485@gmail.com'
        ])

        if (!user.email || !allowedAdminEmails.has(user.email)) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const body = (await req.json()) as CreatePlayerWithAccessPayload

        const playerName = body.playerName?.trim()
        const teamId = body.teamId?.trim()
        const password = body.password?.trim()
        const jerseyNumber = body.jerseyNumber ?? null
        const email = body.email?.trim()

        if (!playerName || !teamId || !password || !email) {
            return new Response(
                JSON.stringify({ error: 'playerName, teamId, email y password son obligatorios' }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            )
        }

        const normalizedEmail = email.toLowerCase()

        const { data: teamData, error: teamError } = await adminClient
            .from('teams')
            .select('id')
            .eq('id', teamId)
            .single()

        if (teamError || !teamData) {
            return new Response(JSON.stringify({ error: 'Equipo no encontrado' }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const { data: createdAuthUser, error: createUserError } =
            await adminClient.auth.admin.createUser({
                email: normalizedEmail,
                password,
                email_confirm: true,
                user_metadata: {
                    player_name: playerName
                }
            })

        if (createUserError || !createdAuthUser.user) {
            return new Response(
                JSON.stringify({ error: createUserError?.message ?? 'No se pudo crear el usuario Auth' }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            )
        }

        const authUserId = createdAuthUser.user.id

        const { data: playerInsert, error: playerInsertError } = await adminClient
            .from('players')
            .insert({
                name: playerName,
                team_id: teamId,
                jersey_number: jerseyNumber,
                is_active: true
            })
            .select('id, name, team_id, jersey_number, is_active')
            .single()

        if (playerInsertError || !playerInsert) {
            await adminClient.auth.admin.deleteUser(authUserId)

            return new Response(
                JSON.stringify({ error: playerInsertError?.message ?? 'No se pudo crear el jugador' }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            )
        }

        const { error: linkError } = await adminClient
            .from('player_users')
            .insert({
                player_id: playerInsert.id,
                user_id: authUserId
            })

        if (linkError) {
            await adminClient.from('players').delete().eq('id', playerInsert.id)
            await adminClient.auth.admin.deleteUser(authUserId)

            return new Response(
                JSON.stringify({ error: linkError.message ?? 'No se pudo vincular jugador y usuario' }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                player: playerInsert,
                authUserId,
                email: normalizedEmail
            }),
            {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Unexpected error'
            }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            }
        )
    }
})
