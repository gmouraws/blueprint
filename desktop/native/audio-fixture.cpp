// Test-only Win32 audio/window fixture; never packaged. Generates quiet known tones.
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>
#include <cmath>
#include <vector>
#include <cstdio>
LRESULT CALLBACK proc(HWND w,UINT m,WPARAM a,LPARAM b){return DefWindowProcW(w,m,a,b);}
int wmain(int argc,wchar_t** argv){
  double hz=argc>1?_wtof(argv[1]):440;int count=argc>2?_wtoi(argv[2]):1;
  WNDCLASSW cls{};cls.lpfnWndProc=proc;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=L"BlueprintCaptureFixture";RegisterClassW(&cls);
  for(int i=0;i<count;i++){wchar_t name[80];swprintf_s(name,L"Blueprint capture fixture %d",i+1);HWND w=CreateWindowW(cls.lpszClassName,name,WS_OVERLAPPEDWINDOW,100+i*5,100+i*5,340,220,nullptr,nullptr,cls.hInstance,nullptr);ShowWindow(w,SW_SHOWNOACTIVATE);if(!i){printf("%llu\n",reinterpret_cast<unsigned long long>(w));fflush(stdout);}}
  PROCESS_INFORMATION child{};
  if(argc>3){wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);wchar_t command[1024];swprintf_s(command,L"\"%s\" 660 1",exe);STARTUPINFOW si{};si.cb=sizeof(si);CreateProcessW(nullptr,command,nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&si,&child);}
  WAVEFORMATEX f{};f.wFormatTag=WAVE_FORMAT_PCM;f.nChannels=2;f.nSamplesPerSec=48000;f.wBitsPerSample=16;f.nBlockAlign=4;f.nAvgBytesPerSec=192000;HWAVEOUT output;
  if(waveOutOpen(&output,WAVE_MAPPER,&f,0,0,CALLBACK_NULL)!=MMSYSERR_NOERROR)return 2;
  std::vector<short> pcm(48000*2);for(int i=0;i<48000;i++)pcm[i*2]=pcm[i*2+1]=static_cast<short>(800*sin(6.283185307179586*hz*i/48000));
  WAVEHDR header{};header.lpData=reinterpret_cast<LPSTR>(pcm.data());header.dwBufferLength=static_cast<DWORD>(pcm.size()*2);header.dwFlags=WHDR_BEGINLOOP|WHDR_ENDLOOP;header.dwLoops=100;
  waveOutPrepareHeader(output,&header,sizeof(header));waveOutWrite(output,&header,sizeof(header));
  auto start=GetTickCount64();while(GetTickCount64()-start<30000){MSG m;while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE)){TranslateMessage(&m);DispatchMessageW(&m);}Sleep(10);}
  waveOutReset(output);waveOutUnprepareHeader(output,&header,sizeof(header));waveOutClose(output);if(child.hProcess){TerminateProcess(child.hProcess,0);CloseHandle(child.hProcess);CloseHandle(child.hThread);}return 0;
}
