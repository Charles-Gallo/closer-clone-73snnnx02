import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, MessageSquare, AlertCircle } from 'lucide-react'

export function AgencyDashboard() {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    totalMessages: 0,
    alerts: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      const { data: customers } = await supabase.from('customers').select('*')
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count: msgCount } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', startOfMonth.toISOString())

      let alertsCount = 0
      if (customers) {
        for (const customer of customers) {
          const { count } = await supabase
            .from('whatsapp_messages')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', customer.id)
            .gte('timestamp', startOfMonth.toISOString())
          if (count && customer.message_limit && count >= customer.message_limit * 0.9) {
            alertsCount++
          }
        }
      }

      setStats({
        totalCustomers: customers?.length || 0,
        activeCustomers: customers?.filter((c) => c.status === 'active').length || 0,
        totalMessages: msgCount || 0,
        alerts: alertsCount,
      })
    }
    fetchStats()
  }, [])

  return (
    <div className="p-6 md:p-10 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Agency Dashboard</h1>
        <p className="text-lg text-muted-foreground">Visão geral de todos os clientes e consumo.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Clientes Ativos
            </CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">de {stats.totalCustomers} total</p>
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
            <p className="text-xs text-muted-foreground mt-1">Clientes próximos do limite</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
