import { Button } from "@/components/ui/button";
import { Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/exports";

interface ExportButtonsProps {
  onDiscordExport: () => string;
  onCSVExport: () => void;
  label?: string;
}

const ExportButtons = ({ onDiscordExport, onCSVExport, label = "Export" }: ExportButtonsProps) => {
  const { toast } = useToast();

  const handleDiscordCopy = async () => {
    const discordText = onDiscordExport();
    const success = await copyToClipboard(discordText);
    
    if (success) {
      toast({
        title: "Copied to clipboard",
        description: "Discord formatted text is ready to paste",
      });
    } else {
      toast({
        title: "Copy failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleDiscordCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Discord Format
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCSVExport}>
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButtons;
