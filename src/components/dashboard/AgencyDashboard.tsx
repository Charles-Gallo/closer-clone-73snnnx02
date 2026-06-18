import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, MessageSquare, AlertCircle, Building2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'

export function AgencyDashboard() {
  const { profile, loading } = useAuth()
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0,
    totalMessages: 0,
    alerts: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      if (profile?.role !== 'agency') return

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data } = await supabase.rpc('get_customers_with_usage', {
        p_month_start: startOfMonth.toISOString(),
      })

      if (data) {
        let alertsCount = 0
        let totalMsg = 0
        let active = 0
        let inactive = 0

        data.forEach((c: any) => {
          totalMsg += Number(c.messages_used)
          if (c.status === 'active') active++
          else inactive++

          if (c.message_limit && c.messages_used >= c.message_limit * 0.8) {
            alertsCount++
          }
        })

        setStats({
          totalCustomers: data.length,
          activeCustomers: active,
          inactiveCustomers: inactive,
          totalMessages: totalMsg,
          alerts: alertsCount,
        })
      }
    }
    if (!loading) fetchStats()
  }, [profile, loading])

  if (loading) return null
  if (profile?.role !== 'agency') return <Navigate to="/app" replace />

  return (
    <div className="p-6 md:p-10 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Agency Dashboard</h1>
        <p className="text-lg text-muted-foreground">Visão geral de todos os clientes e consumo.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Clientes Ativos
            </CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">de {stats.totalCustomers} total</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Clientes Inativos
            </CardTitle>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.inactiveCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">Contas suspensas</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Mensagens (Mês)
            </CardTitle>
            <MessageSquare className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalMessages}</div>
            <p className="text-xs text-muted-foreground mt-1">Em toda a plataforma</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Alertas de Limite
            </CardTitle>
            <AlertCircle className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.alerts}</div>
            <p className="text-xs text-muted-foreground mt-1">{`>80%`} de uso</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
