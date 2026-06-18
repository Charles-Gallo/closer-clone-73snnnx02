import { useEffect, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Edit2, Users, MessageCircle, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function CustomerDetails() {
  const { id } = useParams()
  const { profile, loading: authLoading } = useAuth()
  const [customer, setCustomer] = useState<any>(null)
  const [sdrs, setSdrs] = useState<any[]>([])
  const [activeConvs, setActiveConvs] = useState(0)
  const [loading, setLoading] = useState(true)

  const [editModal, setEditModal] = useState<'evolution' | 'llm' | null>(null)
  const [formData, setFormData] = useState<any>({})

  const fetchData = async () => {
    if (!id) return
    setLoading(true)

    const { data: cData } = await supabase.from('customers').select('*').eq('id', id).single()
    if (cData) setCustomer(cData)

    const { data: sData } = await supabase
      .from('profiles')
      .select('*')
      .eq('customer_id', id)
      .eq('role', 'sdr')
    if (sData) setSdrs(sData)

    const { count } = await supabase
      .from('whatsapp_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id)
      .not('last_message_at', 'is', null)
    setActiveConvs(count || 0)

    setLoading(false)
  }

  useEffect(() => {
    if (!authLoading) fetchData()
  }, [id, authLoading])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('customers').update(formData).eq('id', id)
      if (error) throw error
      toast.success('Configurações atualizadas')
      setEditModal(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const openEdit = (type: 'evolution' | 'llm') => {
    setFormData(customer)
    setEditModal(type)
  }

  if (authLoading || loading)
    return <div className="p-10 text-muted-foreground">Carregando detalhes...</div>
  if (profile?.role !== 'agency') return <Navigate to="/app" replace />
  if (!customer) return <div className="p-10 text-destructive">Cliente não encontrado.</div>

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link to="/agency/customers">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {customer.name}
            <Badge
              variant={customer.status === 'active' ? 'default' : 'secondary'}
              className="capitalize"
            >
              {customer.status}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            Detalhes do tenant e gerencimento de integrações.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">
              SDRs Ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-3xl font-bold">
                {sdrs.length}{' '}
                <span className="text-lg font-normal text-muted-foreground">
                  / {customer.sdr_limit}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border shadow-subtle hover:shadow-elevation transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">
              Conversas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="text-3xl font-bold">{activeConvs}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-3xl border-border shadow-subtle">
          <CardHeader className="flex flex-row justify-between items-center bg-muted/30 rounded-t-3xl border-b border-border">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-indigo-500" /> Evolution API
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEdit('evolution')}
              className="text-muted-foreground hover:text-foreground"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Instance Name
              </div>
              <div className="text-[15px]">
                {customer.evolution_instance_name || 'Não configurado'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                API URL
              </div>
              <div className="text-[15px] break-all">
                {customer.evolution_api_url || 'Não configurado'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Status da Conexão
              </div>
              <Badge variant="outline" className="mt-1 bg-muted/50">
                Aguardando Conexão
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border shadow-subtle">
          <CardHeader className="flex flex-row justify-between items-center bg-muted/30 rounded-t-3xl border-b border-border">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-purple-500" /> Inteligência Artificial (LLM)
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEdit('llm')}
              className="text-muted-foreground hover:text-foreground"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Provider
              </div>
              <div className="text-[15px] capitalize">
                {customer.llm_provider || 'Padrão (Gemini)'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                API Key
              </div>
              <div className="text-[15px]">
                {customer.llm_api_key ? '••••••••••••••••' : 'Não configurada'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-border shadow-subtle overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border">
          <CardTitle>Equipe Cadastrada</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sdrs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              Nenhum SDR cadastrado para este cliente.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sdrs.map((sdr) => (
                <div
                  key={sdr.id}
                  className="flex justify-between items-center p-6 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                      {(sdr.full_name || 'S')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold">{sdr.full_name || 'Sem nome'}</div>
                      <div className="text-sm text-muted-foreground">{sdr.email}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-card">
                    SDR
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editModal} onOpenChange={(val) => !val && setEditModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configurar {editModal === 'evolution' ? 'Evolution API' : 'Integração LLM'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveConfig} className="space-y-4 mt-4">
            {editModal === 'evolution' ? (
              <div className="space-y-4 bg-muted/30 p-4 rounded-2xl border border-border">
                <div className="space-y-2">
                  <Label>Instance Name</Label>
                  <Input
                    value={formData.evolution_instance_name || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, evolution_instance_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>API URL</Label>
                  <Input
                    value={formData.evolution_api_url || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, evolution_api_url: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={formData.evolution_api_key || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, evolution_api_key: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 bg-muted/30 p-4 rounded-2xl border border-border">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Input
                    value={formData.llm_provider || ''}
                    onChange={(e) => setFormData({ ...formData, llm_provider: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={formData.llm_api_key || ''}
                    onChange={(e) => setFormData({ ...formData, llm_api_key: e.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setEditModal(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl px-6">
                Salvar Configurações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
