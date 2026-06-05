-- DropIndex
DROP INDEX "ServiceOrder_osNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_osNumber_operationCode_key" ON "ServiceOrder"("osNumber", "operationCode");
