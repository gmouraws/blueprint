// Original Blueprint implementation of the documented Windows process-loopback API.
// No injection, drivers, playback, recordings, or arbitrary process-control commands.
#define NOMINMAX
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <tlhelp32.h>
#include <wrl.h>
#include <wrl/implements.h>
#include <vector>
#include <string>
#include <cstdio>
#include <cstdint>
using namespace Microsoft::WRL;
struct Handle { HANDLE h=nullptr; ~Handle(){if(h&&h!=INVALID_HANDLE_VALUE)CloseHandle(h);} operator HANDLE()const{return h;} };
class Completion final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IActivateAudioInterfaceCompletionHandler, FtmBase> {
public:
  Handle done{CreateEventW(nullptr,FALSE,FALSE,nullptr)};
  HRESULT result=E_FAIL; ComPtr<IAudioClient> client;
  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> object; HRESULT activation=E_FAIL;
    result=operation->GetActivateResult(&activation,&object);
    if(SUCCEEDED(result))result=activation;
    if(SUCCEEDED(result))result=object.As(&client);
    SetEvent(done); return S_OK;
  }
};
bool supported(){
  using Version=LONG(WINAPI*)(OSVERSIONINFOW*);
  auto fn=reinterpret_cast<Version>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlGetVersion"));
  OSVERSIONINFOW v{};v.dwOSVersionInfoSize=sizeof(v);
  return fn&&fn(&v)==0&&v.dwMajorVersion>=10&&v.dwBuildNumber>=20348;
}
DWORD parentOf(DWORD pid){
  Handle snapshot{CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0)};
  PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);
  if(Process32FirstW(snapshot,&entry))do{if(entry.th32ProcessID==pid)return entry.th32ParentProcessID;}while(Process32NextW(snapshot,&entry));
  return 0;
}
bool descendant(DWORD child,DWORD root){
  for(unsigned i=0;child&&i<128;i++){if(child==root)return true;DWORD next=parentOf(child);if(next==child)break;child=next;}return false;
}
bool number(const wchar_t* value, unsigned long long& result){
  if(!value||!*value)return false;for(auto p=value;*p;p++)if(*p<L'0'||*p>L'9')return false;
  wchar_t* end=nullptr;result=wcstoull(value,&end,10);return result&&end&&!*end;
}
bool writeAll(const void* data,DWORD bytes){
  auto p=static_cast<const BYTE*>(data);while(bytes){DWORD n=0;if(!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE),p,bytes,&n,nullptr)||!n)return false;p+=n;bytes-=n;}return true;
}
int run(int argc,wchar_t** argv){
  if(argc==2&&std::wstring(argv[1])==L"--capabilities"){puts(supported()?"supported":"unsupported");return 0;}
  if(!supported()){fputs("unsupported\n",stderr);return 2;}
  unsigned long long raw=0,ownerRaw=0;
  if(argc!=3||!number(argv[1],raw)||!number(argv[2],ownerRaw)||ownerRaw>MAXDWORD)return 3;
  const DWORD owner=static_cast<DWORD>(ownerRaw);const HWND window=reinterpret_cast<HWND>(raw);DWORD pid=0;
  // Only the spawning Electron process can own this helper. No title-based matching.
  if(parentOf(GetCurrentProcessId())!=owner||!IsWindow(window)||!GetWindowThreadProcessId(window,&pid)||!pid||descendant(pid,owner)||descendant(owner,pid)){fputs("invalid-target\n",stderr);return 3;}
  Handle target{OpenProcess(SYNCHRONIZE|PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid)};
  Handle parent{OpenProcess(SYNCHRONIZE,FALSE,owner)};
  if(!target.h||!parent.h){fputs("inaccessible-target\n",stderr);return 3;}
  DWORD checked=0;GetWindowThreadProcessId(window,&checked);if(checked!=pid||WaitForSingleObject(target,0)!=WAIT_TIMEOUT)return 3;
  AUDIOCLIENT_ACTIVATION_PARAMS params{};params.ActivationType=AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId=pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode=PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT activation{};activation.vt=VT_BLOB;activation.blob.cbSize=sizeof(params);activation.blob.pBlobData=reinterpret_cast<BYTE*>(&params);
  auto completion=Make<Completion>();ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT hr=ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,__uuidof(IAudioClient),&activation,completion.Get(),&operation);
  if(FAILED(hr)||WaitForSingleObject(completion->done,8000)!=WAIT_OBJECT_0||FAILED(completion->result)){fputs("activation-failed\n",stderr);return 4;}
  auto client=completion->client;
  WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=48000;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=192000;
  hr=client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,200000,0,&format,nullptr);
  Handle ready{CreateEventW(nullptr,FALSE,FALSE,nullptr)};ComPtr<IAudioCaptureClient> capture;
  if(FAILED(hr)||FAILED(client->SetEventHandle(ready))||FAILED(client->GetService(IID_PPV_ARGS(&capture)))||FAILED(client->Start())){fputs("capture-failed\n",stderr);return 4;}
  fputs("ready\n",stderr);fflush(stderr);
  HANDLE events[]={parent.h,target.h,ready.h};bool running=true;
  while(running){
    auto wait=WaitForMultipleObjects(3,events,FALSE,100);
    if(wait==WAIT_OBJECT_0||wait==WAIT_OBJECT_0+1||wait==WAIT_FAILED)break;
    DWORD current=0;if(!IsWindow(window)||!GetWindowThreadProcessId(window,&current)||current!=pid)break;
    UINT32 count=0;if(FAILED(capture->GetNextPacketSize(&count)))break;
    while(count){
      BYTE* data=nullptr;UINT32 frames=0;DWORD flags=0;UINT64 position=0,qpc=0;
      if(FAILED(capture->GetBuffer(&data,&frames,&flags,&position,&qpc))){running=false;break;}
      // Bound each packet; the parent drains promptly into a bounded queue.
      for(UINT32 offset=0;offset<frames;offset+=2048){
        UINT32 n=(frames-offset>2048)?2048:frames-offset;
        double timestamp=qpc/10.0+offset*1000000.0/48000.0;
        std::vector<float> pcm(n*2,0);
        if(!(flags&AUDCLNT_BUFFERFLAGS_SILENT)&&data){auto samples=reinterpret_cast<const int16_t*>(data)+offset*2;for(UINT32 i=0;i<n*2;i++)pcm[i]=samples[i]/32768.0f;}
        if(!writeAll(&n,4)||!writeAll(&timestamp,8)||!writeAll(pcm.data(),n*8)){running=false;break;}
      }
      capture->ReleaseBuffer(frames);if(!running||FAILED(capture->GetNextPacketSize(&count)))break;
    }
  }
  client->Stop();return 0;
}
int wmain(int argc,wchar_t** argv){CoInitializeEx(nullptr,COINIT_MULTITHREADED);int result=run(argc,argv);CoUninitialize();return result;}
