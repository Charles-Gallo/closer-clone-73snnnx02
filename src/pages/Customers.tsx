import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Plus, Edit2, CheckCircle2, XCircle, Eye } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { Navigate, Link } from 'react-router-dom'
import { Progress } from '@/components/ui/progress'

export default function Customers() {
  const { profile, loading: authLoading } = useAuth()
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const initialFormState = {
    name: '',
    sdr_limit: 3,
    message_limit: 1000,
    evolution_api_url: '',
    evolution_api_key: '',
    evolution_instance_name: '',
    llm_provider: 'gemini',
    llm_api_key: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    initial_prompt: 'Você é um assistente virtual experiente que qualifica leads.',
  }
  const [formData, setFormData] = useState<any>(initialFormState)

  const fetchCustomers = async () => {
    setLoading(true)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase.rpc('get_customers_with_usage', {
      p_month_start: startOfMonth.toISOString(),
    })

    if (error) {
      toast.error('Erro ao buscar clientes')
    } else {
      setCustomers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!authLoading && profile?.role === 'agency') {
      fetchCustomers()
    }
  }, [authLoading, profile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            sdr_limit: formData.sdr_limit,
            message_limit: formData.message_limit,
            evolution_api_url: formData.evolution_api_url,
            evolution_api_key: formData.evolution_api_key,
            evolution_instance_name: formData.evolution_instance_name,
            llm_provider: formData.llm_provider,
            llm_api_key: formData.llm_api_key,
          })
          .eq('id', editingId)
        if (error) throw error
        toast.success('Cliente atualizado com sucesso')
      } else {
        const { error } = await supabase.rpc('create_customer_with_admin', {
          p_customer_name: formData.name,
          p_admin_email: formData.admin_email,
          p_admin_name: formData.admin_name,
          p_admin_password: formData.admin_password,
          p_sdr_limit: formData.sdr_limit,
          p_message_limit: formData.message_limit,
          p_evo_url: formData.evolution_api_url,
          p_evo_key: formData.evolution_api_key,
          p_evo_instance: formData.evolution_instance_name,
          p_llm_provider: formData.llm_provider,
          p_llm_key: formData.llm_api_key,
          p_initial_prompt: formData.initial_prompt,
        })
        if (error) throw error
        toast.success('Cliente e usuário admin criados com sucesso')
      }
      setIsOpen(false)
      fetchCustomers()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (customer: any) => {
    const newStatus = customer.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.rpc('update_customer_status', {
      p_customer_id: customer.id,
      p_status: newStatus,
    })
    if (error) toast.error('Erro ao atualizar status')
    else fetchCustomers()
  }

  const openEdit = async (customerId: string) => {
    const { data } = await supabase.from('customers').select('*').eq('id', customerId).single()
    if (data) {
      setEditingId(customerId)
      setFormData({
        ...data,
        admin_name: '',
        admin_email: '',
        admin_password: '',
        initial_prompt: '',
      })
      setIsOpen(true)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setFormData(initialFormState)
  }

  if (authLoading) return <div className="p-10">Carregando...</div>
  if (profile?.role !== 'agency') return <Navigate to="/app" replace />

  const filtered = customers.filter((c) => filter === 'all' || c.status === filter)

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os tenants da plataforma e seus limites.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] rounded-xl bg-card border-border shadow-subtle">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Dialog
            open={isOpen}
            onOpenChange={(val) => {
              setIsOpen(val)
              if (!val) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={resetForm} className="rounded-xl gap-2 shadow-subtle">
                <Plus className="h-4 w-4" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {editingId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                <div className="space-y-4 md:col-span-2 bg-muted/50 p-5 rounded-2xl border border-border/50">
                  <h4 className="font-semibold flex items-center gap-2">Detalhes da Empresa</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-3">
                      <Label>Nome da Empresa</Label>
                      <Input
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Limite de SDRs</Label>
                      <Input
                        type="number"
                        required
                        value={formData.sdr_limit || 0}
                        onChange={(e) =>
                          setFormData({ ...formData, sdr_limit: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Limite de Mensagens (Mês)</Label>
                      <Input
                        type="number"
                        required
                        value={formData.message_limit || 0}
                        onChange={(e) =>
                          setFormData({ ...formData, message_limit: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>

                {!editingId && (
                  <div className="space-y-4 md:col-span-2 bg-muted/50 p-5 rounded-2xl border border-border/50">
                    <h4 className="font-semibold text-primary">Conta Admin (Acesso Inicial)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome do Admin</Label>
                        <Input
                          required
                          value={formData.admin_name}
                          onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail do Admin</Label>
                        <Input
                          type="email"
                          required
                          value={formData.admin_email}
                          onChange={(e) =>
                            setFormData({ ...formData, admin_email: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Senha Provisória</Label>
                        <Input
                          type="password"
                          required
                          value={formData.admin_password}
                          onChange={(e) =>
                            setFormData({ ...formData, admin_password: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 md:col-span-2 bg-muted/50 p-5 rounded-2xl border border-border/50">
                  <h4 className="font-semibold">Configurações Técnicas</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Evolution Instance Name</Label>
                      <Input
                        value={formData.evolution_instance_name || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, evolution_instance_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Evolution API URL</Label>
                      <Input
                        value={formData.evolution_api_url || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, evolution_api_url: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Evolution API Key</Label>
                      <Input
                        type="password"
                        value={formData.evolution_api_key || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, evolution_api_key: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>LLM Provider</Label>
                      <Input
                        value={formData.llm_provider || ''}
                        onChange={(e) => setFormData({ ...formData, llm_provider: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>LLM API Key</Label>
                      <Input
                        type="password"
                        value={formData.llm_api_key || ''}
                        onChange={(e) => setFormData({ ...formData, llm_api_key: e.target.value })}
                      />
                    </div>
                    {!editingId && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Prompt do Agente Inicial</Label>
                        <Input
                          value={formData.initial_prompt}
                          onChange={(e) =>
                            setFormData({ ...formData, initial_prompt: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="rounded-xl px-6" disabled={saving}>
                    {saving ? 'Processando...' : editingId ? 'Salvar Alterações' : 'Criar Cliente'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border shadow-subtle overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[300px]">Empresa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SDRs</TableHead>
              <TableHead className="w-[200px]">Uso de Mensagens</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const usagePercent = c.message_limit
                ? Math.min((c.messages_used / c.message_limit) * 100, 100)
                : 0
              const isAlert = usagePercent > 80
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={c.status === 'active' ? 'default' : 'secondary'}
                      className="rounded-md capitalize"
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{c.active_sdrs}</span>
                      <span className="text-muted-foreground text-xs">/ {c.sdr_limit}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5 pr-4">
                      <div className="flex justify-between text-xs">
                        <span
                          className={
                            isAlert ? 'text-destructive font-semibold' : 'text-muted-foreground'
                          }
                        >
                          {c.messages_used} msgs
                        </span>
                        <span className="text-muted-foreground font-medium">{c.message_limit}</span>
                      </div>
                      <Progress
                        value={usagePercent}
                        className={`h-1.5 ${isAlert ? 'bg-destructive/20 [&>div]:bg-destructive' : ''}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        asChild
                      >
                        <Link to={`/agency/customers/${c.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(c.id)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${c.status === 'active' ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-green-500 hover:bg-green-500/10 hover:text-green-600'}`}
                        onClick={() => toggleStatus(c)}
                      >
                        {c.status === 'active' ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {filtered.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
