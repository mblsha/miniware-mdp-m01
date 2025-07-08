#include "processingdata.h"
#include <QVector>
#include <QDebug>
#include <QPointF>
#include <QtCharts/QChartView>
#include <QtCharts/QLineSeries>
#include <QtCharts/QAreaSeries>
#include <QtCharts/QValueAxis>
#include <QtCharts/QSplineSeries>
#include <QDesktopServices>

processingData::processingData(QObject *parent) : QObject(parent)
{
    series_V = new QLineSeries();
    series_V->setName(tr("(单位:V)"));

    series_I = new QLineSeries();
    series_I->setName(tr("(单位:A)"));

    series_V->setPen(QPen(QBrush(QColor(255, 162,0)),2));
    series_I->setPen(QPen(QBrush(QColor(85, 85, 255)),2));

    voltageData.clear();
    electData.clear();
}

void processingData::slotHeartBeat()
{
    slotComSendPack(PACK_HEARTBEAT);
}

//设置当前通道
void processingData::slotSendNowCh(char ch)
{
    QByteArray sendBuff;

    sendBuff.resize(PACK_HEAD_MAX);

    sendBuff[PACK_CH_INDEX] = static_cast<char>(ch);

    slotComSendPack(PACK_SET_CH, "",static_cast<char>(ch));
//    slotComSendPack(PACK_SET_CH, "",static_cast<char>(ch));
    slotComSendPack(PACK_SET_CH, "",static_cast<char>(ch));

    now_ch = ch;
}

void processingData::slotComSendPack(processingData::PACK_TYPE packType, QByteArray Data,int ch)
{
    QByteArray sendBuff;

    sendBuff.resize(PACK_HEAD_MAX);

    //hzl:msvc编译报错修改
    sendBuff[PACK_HEAD_INDEX0] = reinterpret_cast<int>(0x5a);
    sendBuff[PACK_HEAD_INDEX1] = reinterpret_cast<int>(0x5a);
    //sendBuff[PACK_HEAD_INDEX0] = 0x5a;
    //sendBuff[PACK_HEAD_INDEX1] = 0x5a;

    sendBuff[PACK_TYPE_INDEX] = packType;

    sendBuff[PACK_CH_INDEX] = static_cast<char>(ch);

    //将数据丢进去
    sendBuff.append(Data);

    sendBuff[PACK_SIZE_INDEX] = static_cast<char>(sendBuff.size());

    sendBuff[PACK_CHECK] = 0;

    uint8_t tmpCheck = 0;

    for(int i = 0;i < Data.size();i++)
    {
        tmpCheck ^= Data.at(i);
    }

    sendBuff[PACK_CHECK] = static_cast<char>(tmpCheck);

    //sendBuff.append(0x0D);
    //sendBuff.append(0x0A);

    emit signalsSendPack(sendBuff);

}

void processingData::slotCleanWave()
{
    cleanWaveFlag = true;
    if(cleanWaveFlag)
    {
        voltageData.clear();
        electData.clear();
        series_V->clear();
        series_I->clear();
        //testStartTime = 0;
        //StartIndex = 0;
        //cleanWaveFlag = false;
    }
    //voltageData.clear();
    //electData.clear();
}

/* 串口数据解析
 * 描述: 解析串口接收到的数据
 * 参数: buffer   接收到的数据
 * 返回: 无
*/
void processingData::slotDisposeRawPack(QByteArray buffer)
{
    QVector<QByteArray>packVector;
    //包头
    QByteArray packHead;
    packHead.append(0x5a);
    packHead.append(0x5a);

    int index = 0;
    int thisSize = 0;
    int tmp_index;
    while((index = buffer.indexOf(packHead,index)) != -1)
    {
        tmp_index = index + (PACK_SIZE_INDEX - PACK_HEAD_INDEX0);

        //获取包大小,如果超过下标,则结束
        if(tmp_index >= buffer.size())
        {
            //thisSize = 0;
            break;
        }

        thisSize = static_cast<int>(buffer.at(tmp_index));

        //qDebug() << (uint8_t)this_size;

        //剩下数据不足一个包
        if(index + thisSize > buffer.size())
        {
            //thisSize = 0;
            break;
        }

        //QByteArray tmp_buf;
        //提取出数据
        packVector.push_back(buffer.mid(index,thisSize));

        index++;
    }

    //用于处理解析出来的数据包
    for(int j = 0;j < packVector.size();j++)
    {
        //检验数据包是否正确
        if(!packCheeckSelf(const_cast<QByteArray &>(packVector.at(j))))
        {
            qDebug() << "pack_error";
            continue;
        }

        uint8_t pack_type = static_cast<uint8_t>(packVector.at(j).at(PACK_TYPE_INDEX));

        //QString timeStr;
        //QTime time=QTime::currentTime();
        //timeStr="["+time.toString("hh:mm:ss.zzz")+"]";
        //qDebug()<<timeStr;

        switch (pack_type)
        {
            case PACK_SYNTHESIZE:
                //qDebug()<<"SYNTHESIZE";
                processSynthesizePack(packVector.at(j));
                waitSynPack=false;
            break;
            case PACK_UPDAT_CH:
                //qDebug()<<"updat";
                processUpdatCh(packVector.at(j));
            break;
            case PACK_ADDR:
                //qDebug()<<"addr";
                processAddrPack(packVector.at(j));
                emit signalsUpdatUiAddr();
            break;
            case PACK_WAVE:
                //qDebug()<<"wave";
                if(!waitWaveFlag && !waitSynPack)
                {
                    processWavePack(packVector.at(j));
                }
            break;
            case PACK_MACHINE:
                //qDebug()<<"machine";
                processMachineType(packVector.at(j));

            break;
            case PACK_ERR_240:
                emit signalErr240ToUi();
            break;
            default:qDebug() << "error pack"<<packVector.at(j);
        }
    }
}

void processingData::slotSendAllAddrToLower()
{
    QByteArray sendBuffer;
    sendBuffer.clear();
    machine *p = MDP;
    for(int i = 0;i < 6;i++)
    {
        sendBuffer.append(static_cast<char>(p->upDatAddress[0]));
        sendBuffer.append(static_cast<char>(p->upDatAddress[1]));
        sendBuffer.append(static_cast<char>(p->upDatAddress[2]));
        sendBuffer.append(static_cast<char>(p->upDatAddress[3]));
        sendBuffer.append(static_cast<char>(p->upDatAddress[4]));
        sendBuffer.append(static_cast<char>(p->upDatFreq - 2400));
        p++;
    }

    //整理好数据后自动组包发送
    slotComSendPack(PACK_SET_ALL_ADDR, sendBuffer);
}

void processingData::slotSendAddrToLower(int ch)
{
    QByteArray sendBuffer;
    machine *p = &(MDP[ch]);

    sendBuffer.append(static_cast<char>(p->upDatAddress[0]));
    sendBuffer.append(static_cast<char>(p->upDatAddress[1]));
    sendBuffer.append(static_cast<char>(p->upDatAddress[2]));
    sendBuffer.append(static_cast<char>(p->upDatAddress[3]));
    sendBuffer.append(static_cast<char>(p->upDatAddress[4]));
    sendBuffer.append(static_cast<char>((p->upDatFreq) - 2400));

    slotComSendPack(PACK_SET_ADDR, sendBuffer,ch);
    p->updatAddressFlag = false;
}
void processingData::slotSendVoltaToLower(int ch)
{

    QByteArray sendBuffer;
    machine *p = &(MDP[ch]);
    sendBuffer.append(U16_L(p->updatSetPutVoltage));
    sendBuffer.append(U16_H(p->updatSetPutVoltage));
    sendBuffer.append(U16_L(p->updatSetPutCurrent));
    sendBuffer.append(U16_H(p->updatSetPutCurrent));

    slotComSendPack(PACK_SET_V, sendBuffer,ch);

    p->updatSetPutFlag = false;
}
void processingData::slotSendElectToLower(int ch)
{

    QByteArray sendBuffer;
    machine *p = &(MDP[ch]);
    sendBuffer.append(U16_L(p->updatSetPutVoltage));
    sendBuffer.append(U16_H(p->updatSetPutVoltage));
    sendBuffer.append(U16_L(p->updatSetPutCurrent));
    sendBuffer.append(U16_H(p->updatSetPutCurrent));

    slotComSendPack(PACK_SET_I, sendBuffer,ch);

    p->updatSetPutFlag = false;
}

//开启自动匹配
void processingData::slotSendStartAutoMatch()
{
    slotComSendPack(PACK_START_ATUO_MATCH);
}
//关闭自动匹配
void processingData::slotSendStopAutoMatch()
{
    slotComSendPack(PACK_STOP_ATUO_MATCH);
}

void processingData::slotSendStartRGB()
{
    QByteArray sendBuffer;
    sendBuffer.append(1);
    slotComSendPack(PACK_RGB,sendBuffer);
}
void processingData::slotSendStopRGB()
{
    QByteArray sendBuffer;
    sendBuffer.append(1);  //直接增加0会报错.所以先增加再改值
    sendBuffer[0] = 0;
    slotComSendPack(PACK_RGB,sendBuffer);
}

void processingData::slotSendSetOutputState(int ch)
{
    QByteArray sendBuffer;
    sendBuffer.append(1);
    sendBuffer[0] = (MDP[ch].updatoutPutState)?1:0;
    slotComSendPack(PACK_SET_ISOUTPUT,sendBuffer,ch);

    MDP[ch].updatoutPutStateFlag = false;
}

void processingData::slotSendReadAllAddrToPc()
{
    slotComSendPack(PACK_GET_ADDR);
}

void processingData::slotSendToDfu()
{
    slotComSendPack(PACK_RESET_TO_DFU);
    QDesktopServices::openUrl(QUrl("explorer"));
}

void processingData::slotQTimerWave()
{
//    double tmp_V = MDP[now_ch].outPutVoltage;
//    tmp_V /= 1000.0;

//    series_V->append(QPointF(WaveNowIndex,tmp_V));
//    WaveNowIndex += 10;
//    if(WaveNowIndex >= WaveMaxIndex)
//    {
//        series_V->clear();
//        WaveNowIndex = -10;
//    }

}

void processingData::slotWaitWave(bool wait)
{
    waitWaveFlag = wait;
    qDebug() << wait;
}

void processingData::slotStopWave()
{
    waitSynPack = true;
}

void processingData::slotWaveRangeChanged(qreal min, qreal max)
{
    //qDebug() << min << max;
    Q_UNUSED(min);
    setWaveMaxIndex(static_cast<uint32_t>(max));
}

void processingData::slotGetMachineType()
{
    slotComSendPack(PACK_GET_MACHINE);
}

/* 综合包解析
 * 描述: 解析串口接收到的综合包数据
 * 参数: buffer   接收到的数据
 * 返回: 无
*/
void processingData::processSynthesizePack(QByteArray buffer)
{
    machine *p = MDP;
    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);

    //通道切换
    if(now_ch != buf_p[PACK_CH_INDEX])
    {
        if(0 == changeChannelCount)
        {
            now_ch = buf_p[PACK_CH_INDEX];
            emit signalSetChToUi(now_ch);
        }
        else
        {
            changeChannelCount--;
        }
    }

    //跳过包头
    buf_p += PACK_HEAD_MAX;

    bool errFlag=false;

    //解析6通道数据（获取数据后，通过定时器定时更新）
    for(int i = 0;i < 6;i++)
    {
       p->NO = buf_p[syn_pack_NO];
       //输出
       p->outPutVoltage = U8_2_U16(buf_p[syn_pack_real_volt_L],buf_p[syn_pack_real_volt_H]);
       p->outPutCurrent = U8_2_U16(buf_p[syn_pack_real_elect_L],buf_p[syn_pack_real_elect_H]);
       p->outPutPower = static_cast<uint32_t>(p->outPutVoltage * p->outPutCurrent / 1000.0);

       //输入
       p->inPutVoltage = U8_2_U16(buf_p[syn_pack_input_volt_L],buf_p[syn_pack_input_volt_H]);
       p->inPutCurrent = U8_2_U16(buf_p[syn_pack_input_elect_L],buf_p[syn_pack_input_elect_H]);
       p->inPutPower = p->inPutVoltage * p->inPutCurrent;

       //预设
       p->setPutVoltage = U8_2_U16(buf_p[syn_pack_default_volt_L],buf_p[syn_pack_default_volt_H]);
       p->setPutCurrent = U8_2_U16(buf_p[syn_pack_default_elect_L],buf_p[syn_pack_default_elect_H]);
       p->setPutPower = p->setPutVoltage * p->setPutCurrent;

       //温度
       p->temp = U8_2_U16(buf_p[syn_pack_temp_volt_L],buf_p[syn_pack_temp_volt_H]);

       //更改在线状态
       {
           bool tmp_onLine = (buf_p[syn_pack_online] == 1)?true:false;
           if(p->onLine != tmp_onLine)
           {
               p->onLineUpdatFlag = true;
           }
           //p->onLineUpdatFlag = (p->onLine != tmp_onLine)?true:false;
           p->onLine = tmp_onLine;
       }

       //是否锁
       {
           bool tmp_lock = (buf_p[syn_pack_lock] == 1)?true:false;
           p->lockUpdatFlag = (p->lock != tmp_lock)?true:false;
           p->lock = tmp_lock;
       }

       //机械类型
       {
            machine::machineTypeEnum tmp_type_e = machine::nodeType;
            uint8_t tmp_type = buf_p[syn_pack_type];
            switch (tmp_type)
            {
                //错误
                case 0:tmp_type_e = machine::nodeType;break;
                //905
                case 1:tmp_type_e = machine::P905; break;
                //906
                case 2:tmp_type_e = machine::P906; break;
                //load
                case 3:tmp_type_e = machine::L1060; break;
                default:;
            }

            p->machineTypeUpdatFlag = (p->machineType != tmp_type_e)?true:false;
            p->machineType = tmp_type_e;
       }

       //输入输出模式
       {
            machine::outInModeEnum tmp_mode_e = machine::OFF;
            uint8_t tmp_type = buf_p[syn_pack_cc_or_cv];
            uint8_t tmp_output = buf_p[syn_pack_is_output];
            //电子负载的OFF由“输出状态”单独判断
            if(p->machineType==machine::L1060)
            {
                if(tmp_output!=machine::OUTPUT_OFF)
                {
                    switch (tmp_type)
                    {
                        case 0:tmp_mode_e = machine::CC;break;

                        case 1:tmp_mode_e = machine::CV; break;

                        case 2:tmp_mode_e = machine::CR; break;

                        case 3:tmp_mode_e = machine::CP; break;
                        default:;
                    }
                }
            }
            //P906的OFF在type中一起判断
            else
            {
                switch (tmp_type)
                {
                    //错误
                    case 0:tmp_mode_e = machine::OFF;break;

                    case 1:tmp_mode_e = machine::CC; break;

                    case 2:tmp_mode_e = machine::CV; break;

                    case 3:tmp_mode_e = machine::ON; break;
                    default:;
                }
            }

            p->outInModeUpdatFlag = (p->outInMode != tmp_mode_e)?true:false;
            p->outInMode = tmp_mode_e;
       }

       //颜色
       {
            uint16_t tmp_565 = 0;

            tmp_565 = U8_2_U16(buf_p[syn_pack_colour_1],buf_p[syn_pack_colour_2]);

            uint8_t R = static_cast<uint8_t>(static_cast<uint16_t>((tmp_565) & RGB565_RED) >> 8);
            uint8_t G = static_cast<uint8_t>(static_cast<uint16_t>((tmp_565) & RGB565_GREEN) >> 3);
            uint8_t B = static_cast<uint8_t>(static_cast<uint16_t>((tmp_565) & RGB565_BLUE) << 3);

            if(p->color != QColor(R,G,B))
            {
                p->colorUpdatFlag = true;
            }
            //p->colorUpdatFlag = (p->color != QColor(R,G,B))?true:false;

            p->color = QColor(R,G,B);
       }

       //报错
       {
           if(buf_p[syn_pack_error] == 1)   errFlag=true;
       }



       {
            p->outPutState = (buf_p[syn_pack_is_output] == 0)?false:true;
       }

        //下一个对象
        p++;
        buf_p += syn_pack_max;
    }

    emit signalErrTips(errFlag);
}

/* 地址/频率包解析
 * 描述: 解析串口接收到的地址/频率包数据
 * 参数: buffer   接收到的数据
 * 返回: 无
*/
void processingData::processAddrPack(QByteArray buffer)
{
    machine *p = MDP;
    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);

    buf_p += PACK_HEAD_MAX;
    for(int i = 0;i < 6;i++)
    {
        p->address[4] = buf_p[0];
        p->address[3] = buf_p[1];
        p->address[2] = buf_p[2];
        p->address[1] = buf_p[3];
        p->address[0] = buf_p[4];
        p->freq       = buf_p[5] + 2400;

        //qDebug() << QString().sprintf("%d",buf_p[5]);
        if(0 == p->address[0] && 0 == p->address[1] && 0 == p->address[2] && 0 == p->address[3] && 0 == p->address[4])
        {
            p->addrEmpty = true;
        }
        else
        {
           p->addrEmpty = false;
        }


        p->addressFlag = true;
        buf_p += 6;
        p++;
    }
}


/* 波形包解析
 * 描述: 解析串口接收到的波形包数据
 * 参数: buffer   接收到的数据
 * 返回: 无
*/
void processingData::processWavePack(QByteArray buffer)
{
    static double testStartTime = 0;
    static int StartIndex = 0;

    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);

    //忽略非当前通道波形数据
    if(buf_p[PACK_CH_INDEX] != now_ch)
    {
        return;
    }

    //清空波形，清除后从头画
    if(cleanWaveFlag)
    {
        voltageData.clear();
        electData.clear();
        testStartTime = -100;
        StartIndex = 0;
        cleanWaveFlag = false;
    }


    quint8 packSize=buf_p[PACK_SIZE_INDEX];     //获取波形包大小，后面判断数据组包含的点的数量

    buf_p += PACK_HEAD_MAX;     //跳过包头

    //循环10个数据组（每个数据组4个或2个点数据）
    for (int i = 0;i < 10;i++)
    {
        double tmpPointBetween = 0;

        //数据点时间
        uint32_t tmpTime = static_cast<uint32_t>(buf_p[0] | buf_p[1] << 8 | buf_p[2] << 16 | buf_p[3] << 24);
        tmpPointBetween = tmpTime;      //这里节省了一个double中间变量，用于将时间tmpTime无符号型转换成浮点型

        quint8 groupSize;
        if(packSize==126)   groupSize=2;        //126字节为2个点一组
        else                groupSize=4;        //否则（206）为4个点一组

        if(buf_p)    tmpPointBetween /= groupSize;           //每个点之间的时间间隔
        tmpPointBetween /= 10;
        //循环数据组包含的数据
        for(int j = 0;j < groupSize;j++)
        {
            double tmp = 0;
            double tmpElect = 0;
            //转换电压电流数值
            tmp = U8_2_U16(buf_p[4 + j * 4],buf_p[5 + j * 4]);
            tmp /= 1000.0;

            tmpElect = U8_2_U16(buf_p[6 + j * 4],buf_p[7 + j * 4]);
            tmpElect /= 1000.0;
            //判断是否超显示限制,这里加目的是为了再延伸波形出显示框一点
            if(testStartTime < WaveMaxIndex /*+ (WaveMaxIndex * 0.1)*/)
            {
                //若图表未画满，数据点追加到后面
                if(StartIndex >= voltageData.size() || StartIndex >= electData.size())
                {
                    voltageData.append(QPointF(testStartTime,tmp));
                    electData.append(QPointF(testStartTime,tmpElect));
                }
                else
                {
                    //若图表已画满，数据点从前向后覆盖
                    if(StartIndex < voltageData.size() && StartIndex < electData.size())
                    {
                        voltageData.replace(StartIndex,QPointF(testStartTime,tmp));
                        electData.replace(StartIndex,QPointF(testStartTime,tmpElect));
                    }

                    //若覆盖后的下一个点仍在图表范围内
                    for(int k = 1;StartIndex + k < voltageData.size() && StartIndex + k > 0;k++)
                    {
                        //若覆盖后的下一个点仍在图表范围内
                        if(voltageData.at(StartIndex + k).x() < testStartTime ||
                           electData.at(StartIndex + k).x() < testStartTime)
                        {
                            if(StartIndex + k < voltageData.size() && StartIndex + k < electData.size())
                            {
                                voltageData.removeAt(StartIndex + k);
                                electData.removeAt(StartIndex + k);
                                k--;
                            }
                        }
                    }
                }
                StartIndex++;
                testStartTime += tmpPointBetween;
            }
            //循环显示，从最左侧开始
            else
            {
                testStartTime = -50;
                StartIndex = 0;
                //如果要刷完清空屏幕就调用下面两个函数
                //voltageData.clear();
                //electData.clear();
            }
        }
        buf_p += 4+4*groupSize;     //跳到下一个数据组
    }
    series_V->replace(voltageData);
    series_I->replace(electData);
}

void processingData::processWaceReal(QByteArray buffer)
{
    Q_UNUSED(buffer);
}

void processingData::processUpdatCh(QByteArray buffer)
{
    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);
    buf_p += PACK_HEAD_MAX;
    //qDebug() << buffer.toHex();

    //读一次地址
    //slotSendReadAllAddrToPc();

    emit signalSetUiCh(static_cast<int>(buf_p[0]));


}

bool processingData::packCheeckSelf(QByteArray &buffer)
{
    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);


    //存放传输过来的数据
    uint8_t cheeck = buf_p[PACK_CHECK];
    uint8_t size = buf_p[PACK_SIZE_INDEX] - PACK_HEAD_MAX;


    buf_p += PACK_HEAD_MAX;
    uint8_t tmpCheeck = 0;  //用存放本地运算的
    for(int i = 0;i < size;i++)
    {
        tmpCheeck ^= buf_p[i];
    }

//统计误包率
#if 0
    {
       static uint32_t count = 0;
       static uint32_t error = 0;
       static uint32_t ok = 0;
       if(tmpCheeck != cheeck)
       {
            error++;
       }
       else
       {
            ok++;
       }

        count++;

        double tmpCount = count,tmpError = error;
        qDebug() << tmpError / tmpCount;
    }

#endif



    if(tmpCheeck != cheeck)return false;

    return true;
}



void processingData::processMachineType(QByteArray buffer)
{
    char *tmp_p = buffer.data();
    uint8_t *buf_p = reinterpret_cast<uint8_t *>(tmp_p);
    buf_p += PACK_HEAD_MAX;
    //qDebug() << buffer.toHex();

    if(buf_p[0] == haveLcd)
    {
        machineType = haveLcd;
    }
    else
    {
         machineType = noLcd;
    }

    emit signalSetMachine();
}

