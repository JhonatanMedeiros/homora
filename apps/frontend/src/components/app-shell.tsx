import type { ReactNode } from 'react';
import { ArrowLeft, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { navItems, type Tab } from '@/components/app-nav';

type Props = {
  tab: Tab;
  managing: boolean;
  onManageChange: (value: boolean) => void;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  toolbar: ReactNode;
  children: ReactNode;
};

export function AppShell({
  tab,
  managing,
  onManageChange,
  onTabChange,
  onLogout,
  toolbar,
  children,
}: Props) {
  return (
    <div className="min-h-svh bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-4 py-2 md:px-8">
          <BrandMark className="mr-auto text-sidebar-foreground" />
          <ThemeToggle className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            aria-label="Sair"
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut />
          </Button>
          <Button
            variant="outline"
            onClick={() => onManageChange(!managing)}
            className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {managing ? <ArrowLeft /> : <Settings />} {managing ? 'Voltar ao início' : 'Gerenciar'}
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        {!managing && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl">Tudo em seu lugar.</h1>
              <p className="mt-1 text-muted-foreground">
                Seus serviços, prontos para abrir quando precisar.
              </p>
            </div>
            <div className="w-full sm:w-80">{toolbar}</div>
          </div>
        )}
        {managing ? (
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <aside className="shrink-0 md:sticky md:top-8 md:w-52">
              <div className="mb-3 px-3">
                <p className="font-label text-xl font-semibold">Gerenciamento</p>
                <p className="mt-1 text-sm text-muted-foreground">Configure seu espaço</p>
              </div>
              <nav aria-label="Gerenciamento" className="flex flex-wrap gap-1 md:flex-col">
                {navItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={tab === item.id ? 'secondary' : 'ghost'}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => onTabChange(item.id)}
                    className="justify-start"
                  >
                    <item.icon />
                    {item.label}
                  </Button>
                ))}
              </nav>
            </aside>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
