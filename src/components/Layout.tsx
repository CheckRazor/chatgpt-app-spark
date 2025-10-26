import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Trophy, Users, LogOut, Shield, Calendar, Package, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { signOut, userRole, user, isAdmin, isLeader } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const getRoleBadgeColor = () => {
    switch (userRole) {
      case "admin":
        return "destructive";
      case "leader":
        return "default";
      case "viewer":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Avalon Medal Manager</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-medium">{user?.email}</span>
              {userRole && (
                <Badge variant={getRoleBadgeColor()} className="text-xs">
                  <Shield className="mr-1 h-3 w-3" />
                  {userRole}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            <Link to="/dashboard">
              <Button
                variant={isActive("/dashboard") ? "default" : "ghost"}
                size="sm"
                className="rounded-b-none"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link to="/">
              <Button
                variant={isActive("/") ? "default" : "ghost"}
                size="sm"
                className="rounded-b-none"
              >
                <Users className="mr-2 h-4 w-4" />
                Players
              </Button>
            </Link>
            <Link to="/events">
              <Button
                variant={isActive("/events") || location.pathname.startsWith("/events") ? "default" : "ghost"}
                size="sm"
                className="rounded-b-none"
              >
                <Calendar className="mr-2 h-4 w-4" />
                Events
              </Button>
            </Link>
            {(isAdmin || isLeader) && (
              <Link to="/bulk-operations">
                <Button
                  variant={isActive("/bulk-operations") ? "default" : "ghost"}
                  size="sm"
                  className="rounded-b-none"
                >
                  <Package className="mr-2 h-4 w-4" />
                  Bulk Operations
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
};

export default Layout;
