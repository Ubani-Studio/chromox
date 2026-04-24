import * as Slider from '@radix-ui/react-slider';

type StyleSliderProps = {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
};

export function StyleSlider({ label, min = 0, max = 1, step = 0.01, value, onChange }: StyleSliderProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-elevated p-4">
      <div className="flex items-center justify-between gap-2 text-[10px] tracking-tight text-muted">
        <span className="truncate">{label}</span>
        <span className="font-mono text-xs text-accent">{value.toFixed(2)}</span>
      </div>
      <Slider.Root
        className="relative flex h-6 w-full touch-none select-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      >
        <Slider.Track className="relative h-[4px] flex-1 rounded-full bg-[#CCCCCC]">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-none bg-black shadow-sm" />
      </Slider.Root>
    </div>
  );
}
