@echo off
echo Creating Task...
curl -s -X POST http://localhost:3001/tasks -H "Content-Type: application/json" -d "{\"title\":\"Test Delegation Flow\",\"description\":\"Verify that delegation works and results are retrievable.\",\"priority\":\"high\"}" > task_create.json
type task_create.json
echo.

echo Reading Task ID from task_create.json...
for /f "tokens=*" %%a in ('powershell -Command "(Get-Content task_create.json | ConvertFrom-Json).id"') do set TASK_ID=%%a
echo Task ID: %TASK_ID%

echo Delegating Task...
curl -s -X POST http://localhost:3001/api/delegate/%TASK_ID% -H "Content-Type: application/json" -d "{\"autonomous\":true}" > delegation_result.json
type delegation_result.json
echo.

echo Waiting for processing (5s)...
timeout /t 5

echo Fetching Delegation History (Full Result)...
curl -s -X GET http://localhost:3001/api/delegate/%TASK_ID%/delegations > history.json
type history.json
echo.

echo Done.
