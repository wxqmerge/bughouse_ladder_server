@echo off
cd /d %~dp0..\scripts
echo Starting LLM Model Evaluation...
echo Make sure each model server is running on its assigned port.
echo.
node eval-models.mjs
pause
