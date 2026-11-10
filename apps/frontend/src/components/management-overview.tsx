import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navItems, type Tab } from '@/components/app-nav';

const descriptions: Record<Tab, string> = {
  services: 'Adicione serviços e organize seus grupos.',
  integrations: 'Configure conexões e widgets disponíveis.',
  agents: 'Gerencie acessos e revise propostas.',
};
export function ManagementOverview({ onSelect }: { onSelect: (tab: Tab) => void }) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Gerenciar seu espaço</h1>
        <p className="mt-1 text-muted-foreground">Escolha o que deseja configurar.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            className="h-auto min-h-28 justify-start whitespace-normal p-4 text-left"
            onClick={() => onSelect(item.id)}
          >
            <item.icon />
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-label text-lg">{item.label}</span>
              <span className="font-normal text-muted-foreground">{descriptions[item.id]}</span>
            </span>
            <ArrowRight />
          </Button>
        ))}
      </div>
    </section>
  );
}
