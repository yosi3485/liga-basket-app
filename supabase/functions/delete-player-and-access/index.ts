import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'supabase'

type DeletePlayerAndAccessPayload = {
    playerId: string
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

        const body = (await req.json()) as DeletePlayerAndAccessPayload
        const playerId = body.playerId?.trim()

        if (!playerId) {
            return new Response(JSON.stringify({ error: 'playerId es obligatorio' }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const { data: linkData, error: linkReadError } = await adminClient
            .from('player_users')
            .select('user_id')
            .eq('player_id', playerId)
            .maybeSingle()

        if (linkReadError) {
            return new Response(JSON.stringify({ error: linkReadError.message }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        const linkedUserId = linkData?.user_id ?? null

        const { error: deletePlayerError } = await adminClient
            .from('players')
            .delete()
            .eq('id', playerId)

        if (deletePlayerError) {
            return new Response(JSON.stringify({ error: deletePlayerError.message }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            })
        }

        if (linkedUserId) {
            const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(linkedUserId)

            if (deleteAuthError) {
                return new Response(JSON.stringify({ error: deleteAuthError.message }), {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                })
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                playerId,
                deletedAuthUser: Boolean(linkedUserId)
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
