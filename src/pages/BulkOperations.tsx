import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BulkDeductions from "@/components/bulk-operations/BulkDeductions";
import BatchAuditLog from "@/components/bulk-operations/BatchAuditLog";

const BulkOperations = () => {
  const { user, loading, isAdmin, isLeader } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  const canManage = isAdmin || isLeader;

  if (!canManage) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6 text-center text-destructive">
            You don't have permission to access this page.
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bulk Operations</CardTitle>
            <CardDescription>
              Manage bulk deductions and view batch operation history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="deductions">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="deductions">Bulk Deductions</TabsTrigger>
                <TabsTrigger value="audit">Audit Log</TabsTrigger>
              </TabsList>
              <TabsContent value="deductions" className="mt-6">
                <BulkDeductions />
              </TabsContent>
              <TabsContent value="audit" className="mt-6">
                <BatchAuditLog />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default BulkOperations;
