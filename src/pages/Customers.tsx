import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Customer } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Plus, Edit2, CheckCircle2, XCircle } from 'lucide-react'
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

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    status: 'active',
    sdr_limit: 3,
    message_limit: 1000,
    evolution_api_url: '',
    evolution_api_key: '',
    evolution_instance_name: '',
    llm_provider: 'gemini',
    llm_api_key: '',
  })

  const fetchCustomers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Erro ao buscar clientes')
    } else {
      setCustomers(data as unknown as Customer[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update(formData).eq('id', editing.id)
        if (error) throw error
        toast.success('Cliente atualizado')
      } else {
        const { error } = await supabase.from('customers').insert(formData)
        if (error) throw error
        toast.success('Cliente criado')
      }
      setIsOpen(false)
      fetchCustomers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const toggleStatus = async (customer: Customer) => {
    const newStatus = customer.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase
      .from('customers')
      .update({ status: newStatus })
      .eq('id', customer.id)
    if (error) toast.error('Erro ao atualizar status')
    else fetchCustomers()
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setFormData(customer)
    setIsOpen(true)
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Clientes</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus tenants, limites e APIs.</p>
        </div>
        <Dialog
          open={isOpen}
          onOpenChange={(val) => {
            setIsOpen(val)
            if (!val) setEditing(null)
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => setFormData({ status: 'active', sdr_limit: 3, message_limit: 1000 })}
              className="rounded-xl gap-2"
            >
              <Plus className="h-4 w-4" /> Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2 col-span-2">
                <Label>Nome do Cliente</Label>
                <Input
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>SDR Limit</Label>
                <Input
                  type="number"
                  required
                  value={formData.sdr_limit || 0}
                  onChange={(e) => setFormData({ ...formData, sdr_limit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagens por Mês Limit</Label>
                <Input
                  type="number"
                  required
                  value={formData.message_limit || 0}
                  onChange={(e) =>
                    setFormData({ ...formData, message_limit: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2 col-span-2 mt-2">
                <h4 className="font-semibold text-sm border-b pb-2">Evolution API</h4>
              </div>
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
                  onChange={(e) => setFormData({ ...formData, evolution_api_url: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.evolution_api_key || ''}
                  onChange={(e) => setFormData({ ...formData, evolution_api_key: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2 mt-2">
                <h4 className="font-semibold text-sm border-b pb-2">LLM (AI Agent)</h4>
              </div>
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
              <div className="col-span-2 flex justify-end mt-4">
                <Button type="submit" className="rounded-xl">
                  Salvar Cliente
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SDRs (Lim)</TableHead>
              <TableHead>Msg (Lim)</TableHead>
              <TableHead>Evolution</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === 'active' ? 'default' : 'secondary'}
                    className="rounded-md"
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell>{c.sdr_limit}</TableCell>
                <TableCell>{c.message_limit}</TableCell>
                <TableCell>
                  {c.evolution_instance_name ? (
                    <span className="text-xs bg-muted px-2 py-1 rounded-md">
                      {c.evolution_instance_name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Não conf.</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => toggleStatus(c)}>
                      {c.status === 'active' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {customers.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
