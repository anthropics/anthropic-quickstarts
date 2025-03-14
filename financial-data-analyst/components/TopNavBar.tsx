"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Moon, Sun, BarChart3, PieChart } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Add this interface to define the props structure
interface TopNavBarProps {
  features?: {
    showDomainSelector?: boolean;
    showViewModeSelector?: boolean;
    showPromptCaching?: boolean;
  };
}

// Change this line to include the props type
const TopNavBar: React.FC<TopNavBarProps> = ({ features = {} }) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-4">
      <div className="font-bold text-xl flex gap-2 items-center">
        <Link href="/">
          <Image
            src={theme === "dark" ? "/wordmark-dark.svg" : "/wordmark.svg"}
            alt="Company Wordmark"
            width={112}
            height={20}
          />
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <nav className="hidden md:flex space-x-4 items-center mr-4">
          <Link href="/finance" className="flex items-center gap-2 hover:text-primary">
            <PieChart className="h-4 w-4" />
            <span>Finance</span>
          </Link>
          <Link href="/mcp" className="flex items-center gap-2 hover:text-primary">
            <BarChart3 className="h-4 w-4" />
            <span>MCP Dashboard</span>
          </Link>
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default TopNavBar;
