import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return response;
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })

                    // Capture current response cookies before overwriting
                    const previousCookies = response.cookies.getAll();

                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })

                    // Restore previous cookies
                    previousCookies.forEach(cookie => {
                        response.cookies.set(cookie)
                    })

                    // Set new cookie
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })

                    // Capture current response cookies
                    const previousCookies = response.cookies.getAll();

                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })

                    // Restore previous cookies
                    previousCookies.forEach(cookie => {
                        response.cookies.set(cookie)
                    })

                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Protect project routes - redirect to login if no user
    if (!user && (request.nextUrl.pathname.startsWith('/project') || request.nextUrl.pathname === '/')) {
        // Allow access to home for now to not block user, or force login
        // Let's force login for anything project related
        if (request.nextUrl.pathname.startsWith('/project')) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|login|auth).*)',
    ],
}
