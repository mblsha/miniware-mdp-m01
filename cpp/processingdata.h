#ifndef PROCESSINGDATA_H
#define PROCESSINGDATA_H

#include <QObject>
#include "machine.h"
#include <QtCharts/QChartView>
#include <QtCharts/QLineSeries>
#include <QtCharts/QAreaSeries>
#include <QtCharts/QValueAxis>
#include <QtCharts/QSplineSeries>
#include <QTimer>
#include <QTime>

QT_USE_NAMESPACE

#define RGB888_RED      0x00ff0000
#define RGB888_GREEN    0x0000ff00
#define RGB888_BLUE     0x000000ff

#define RGB565_RED      0xf800
#define RGB565_GREEN    0x07e0
#define RGB565_BLUE     0x001f

#define U16_L(num)		(static_cast<char>((num)&0xff))
#define U16_H(num)		(static_cast<char>(((num)&0xff00) >> 8))

#define U32_L8(num)		((num)&0xff)
#define U32_L16(num)	(((num)&0xff00) >> 8)
#define U32_H24(num)	(((num)&0xff0000) >> 16)
#define U32_H32(num)	(((num)&0xff000000) >> 24)

#define U8_2_U16(_L,_H)  (static_cast<uint16_t>((static_cast<uint16_t>(_L))|((static_cast<uint16_t>(_H))<<8)))
class processingData : public QObject
{
    Q_OBJECT
public:
    explicit processingData(QObject *parent = nullptr);

    //机子相关的数据
    machine MDP[6];

    //当前通道
    int now_ch = 0;
    //切换通道计时,避免用户切换界面,然后下位机又上传通道来造成冲突
    int changeChannelCount = 0;

    bool waitWaveFlag = false;
    bool waitSynPack = true;       //未连接过设备，忽略波形包，等待综合包
    //包类型。
    enum PACK_TYPE
       {
           PACK_SYNTHESIZE = 0x11, 	   //综合包数据
           PACK_WAVE = 0x12,           //波形
           PACK_ADDR,				   //地址和频率数据
           PACK_UPDAT_CH,              //提示更新通道
           PACK_MACHINE,			//获取机械类型
           //

           //主机到类型
           PACK_SET_ISOUTPUT,			//设置开关
           PACK_GET_ADDR,			   //主机想要获取地址和频率数据
           PACK_SET_ADDR,			   //设置地址
           PACK_SET_CH, 			   //设置通道(不带数据)
           PACK_SET_V,				   //设置电压
           PACK_SET_I,				   //设置电流
           PACK_SET_ALL_ADDR,		   //设置所有地址和频率
           PACK_START_ATUO_MATCH,	   //发送自动匹配包
           PACK_STOP_ATUO_MATCH,	   //关闭自动匹配
           PACK_RESET_TO_DFU,		   //重启到DFU
           PACK_RGB,                    //开启RGB
           PACK_GET_MACHINE,			//获取机械类型
           PACK_HEARTBEAT,				//心跳包
    //       PACK_SET_COLOUR,			    //设置一个颜色
    //       PACK_SET_ALL_COLOUR          //设置全部颜色

           PACK_ERR_240,			//240模块错误
       };
    //包头下标。
    enum PACK_INDEX
    {
        PACK_HEAD_INDEX0             =  0  , //包头0
        PACK_HEAD_INDEX1			 =  1  ,//包头1
        PACK_TYPE_INDEX                , //包类型
        PACK_SIZE_INDEX                , //总包大小
        PACK_CH_INDEX                  , //通道号
        PACK_CHECK                     , //检验
        PACK_HEAD_MAX                    //包头大小限制
    };
    //综合数据报下标。
    enum synthesize_pack_index
    {
        syn_pack_NO					= 0,            //标号
        syn_pack_real_volt_L 		= 1, 			//实时电压低位
        syn_pack_real_volt_H		,				//实时电压高位
        syn_pack_real_elect_L		,				//实时电流低位
        syn_pack_real_elect_H		,               //实时电流高位

        syn_pack_input_volt_L 		,	            //输入电压低位
        syn_pack_input_volt_H		,				//输入电压高位
        syn_pack_input_elect_L		,               //输入电流低位
        syn_pack_input_elect_H		,	            //输入电流高位

        syn_pack_default_volt_L 	,				//预设电压低位
        syn_pack_default_volt_H		,				//预设电压高位
        syn_pack_default_elect_L	,         	    //预设电流低位
        syn_pack_default_elect_H	,	            //预设电流高位

        syn_pack_temp_volt_L 		,			    //温度高位
        syn_pack_temp_volt_H		,			    //温度低位

        syn_pack_online				,			//是否在线
        syn_pack_type				,			//机器类型
        syn_pack_lock				,			//是否锁
        syn_pack_cc_or_cv			,			//CC还是CV模式
        syn_pack_is_output			,			//是否输出状态

        syn_pack_colour_1			,			//颜色位1
        syn_pack_colour_2			,           //颜色位2
        syn_pack_colour_3			,           //颜色位3

        syn_pack_error              ,           //报错

        syn_pack_end				,			//包结尾

        syn_pack_max				, 			//包大小
    };
    //设备类型。
    enum machine_type
    {
        noType = 0x0f,  //还没有类型
        haveLcd = 0x10, //带LCD屏幕的 M01
        noLcd = 0x11,  //不带LCD屏幕的 M02
    };

    //判断插入设备的类型的
    machine_type machineType = noType;

    void setWaveMaxIndex(uint32_t Index){WaveMaxIndex = static_cast<int>(Index);/*slotCleanWave();*/}

    QLineSeries  *series_V;
    QLineSeries  *series_I;

signals:
    //发送数据
    void signalsSendPack(QByteArray);
    //更新数据到界面
    void signalsUpdatUiAddr();
    //设置通道到界面
    void signalSetUiCh(int);

    //通知获取地址还是设置地址
    void signalSetMachine();
    //240模块错误
    void signalErr240ToUi();
    //设置通道到界面
    void signalSetChToUi(int);
    //报错提示
    void signalErrTips(bool err);
public slots:
    //发送心跳包
    void slotHeartBeat();
    //发送当前通道
    void slotSendNowCh(char);
    //发送数据包
    void slotComSendPack(PACK_TYPE packType,QByteArray Data = "",int ch = 0xee);
    //清除波形图
    void slotCleanWave();
    //接收原始数据
    void slotDisposeRawPack(QByteArray buffer);

    //更新全部地址到下位机
    void slotSendAllAddrToLower();
    //更新一个地址到下位机
    void slotSendAddrToLower(int);
    //更新一个电压/电流到下位机
    void slotSendVoltaToLower(int);
    void slotSendElectToLower(int);

    //开启关闭自动匹配功能
    void slotSendStartAutoMatch();
    void slotSendStopAutoMatch();
    //开启LED的闪灯
    void slotSendStartRGB();
    void slotSendStopRGB();
    //设置输出状态
    void slotSendSetOutputState(int);

    void slotSendReadAllAddrToPc();
    //重启到DFU
    void slotSendToDfu();

    void slotQTimerWave();
    //暂停波形图刷新
    void slotWaitWave(bool);
    void slotStopWave();
    //波形图范围改变
    void slotWaveRangeChanged(qreal min,qreal max);
    //取设备类型。
    void slotGetMachineType();
private:
    void processSynthesizePack(QByteArray buffer);
    //处理地址数据包。
    void processAddrPack(QByteArray buffer);
    //处理波型数据包。
    void processWavePack(QByteArray buffer);

    void processWaceReal(QByteArray buffer);
    //处理更新通道包。
    void processUpdatCh(QByteArray buffer);
    //校验数据包。
    bool packCheeckSelf(QByteArray &buffer);
    //处理设备类型数据包。
    void processMachineType(QByteArray buffer);

    QTimer WaveTimer;
    //电压，电流波形数据。
    QList<QPointF> voltageData;
    QList<QPointF> electData;
    bool cleanWaveFlag = false;

//    QByteArray RawPack;
    int WaveMaxIndex = 4000;
    int WaveNowIndex = 0;


};

#endif // PROCESSINGDATA_H
