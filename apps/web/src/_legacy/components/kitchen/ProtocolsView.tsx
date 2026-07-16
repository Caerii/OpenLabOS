import { Badge, Btn, Card, Icon, SectionLabel, SelectableCard, TagList } from "../ui/index";
import { ICON } from "./icons";
import type { KitchenProtocolSummary } from "../../api";
import { DifficultyBadge } from "./DifficultyBadge";

function ProtocolCard({ protocol: p, selected, onClick }: {
  protocol: KitchenProtocolSummary; selected: boolean; onClick: () => void;
}) {
  return (
    <SelectableCard selected={selected} onClick={onClick}>
      <div className="flex items-start justify-between mb-2.5">
        <h4 className="font-medium text-[13px] text-fg group-hover:text-accentText transition-colors">{p.name}</h4>
        <DifficultyBadge difficulty={p.difficulty} />
      </div>
      <p className="text-xs text-muted mb-3 line-clamp-2 leading-relaxed">{p.description}</p>
      <div className="flex items-center gap-4 text-[11px] text-subtle">
        <span className="flex items-center gap-1"><Icon d={ICON.list} size={12} />{p.stepCount} steps</span>
        <span className="flex items-center gap-1"><Icon d={ICON.clock} size={12} />~{p.estimatedMinutes}min</span>
      </div>
      {p.tags && <div className="mt-2.5"><TagList items={p.tags} /></div>}
    </SelectableCard>
  );
}

export default function ProtocolsView({ protocols, selectedProtocol, onSelect, onStart, isActive }: {
  protocols: KitchenProtocolSummary[];
  selectedProtocol: string;
  onSelect: (id: string) => void;
  onStart: () => void;
  isActive: boolean;
}) {
  const selected = protocols.find((protocol) => protocol.id === selectedProtocol) || null;

  return (
    <div className="space-y-5 animate-fade-in">
      <Card className="sticky top-[112px] z-20 shadow-sm md:static md:shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <SectionLabel>Selected Protocol</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">
                {selected ? selected.name : "Choose a protocol below"}
              </h3>
              {selected && <Badge color="blue">{selected.stepCount} steps</Badge>}
              {selected && <DifficultyBadge difficulty={selected.difficulty} />}
            </div>
            <p className="mt-1 text-xs text-muted line-clamp-2">
              {selected ? selected.description : "Pick the protocol first, then start the run from here."}
            </p>
          </div>
          <Btn
            variant="primary"
            size="md"
            className="w-full sm:w-auto"
            onClick={onStart}
            disabled={!selectedProtocol || isActive}
          >
            Start Protocol
          </Btn>
        </div>
        {isActive && <p className="mt-3 text-xs text-warn-fg">A run is already active. Abort it first.</p>}
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {protocols.map((p) => (
          <ProtocolCard key={p.id} protocol={p} selected={selectedProtocol === p.id} onClick={() => onSelect(p.id)} />
        ))}
      </div>
    </div>
  );
}
